-- 状態追加・要確認理由
ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_status_check;
ALTER TABLE public.purchases ADD CONSTRAINT purchases_status_check
  CHECK (status IN ('pending','approved','rejected','needs_check','checked','delivered'));
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS check_reason text;

-- アカウント無効化（削除扱い。過去データは保持）
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS disabled_at timestamptz;

-- 管理者閲覧用 4桁パスワード控え
CREATE TABLE public.account_pins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  pin text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.account_pins TO authenticated;
GRANT ALL ON public.account_pins TO service_role;
ALTER TABLE public.account_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pins admin read" ON public.account_pins FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_my_pin(_pin text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR _pin !~ '^\d{4}$' THEN RAISE EXCEPTION 'invalid'; END IF;
  INSERT INTO public.account_pins (user_id, pin) VALUES (auth.uid(), _pin)
  ON CONFLICT (user_id) DO UPDATE SET pin = EXCLUDED.pin, updated_at = now();
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_my_pin(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.set_my_pin(text) TO authenticated;

-- 要確認 → 確認済（一般アカウントも可）
CREATE OR REPLACE FUNCTION public.mark_purchase_checked(_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.purchases p SET status = 'checked'
  WHERE p.id = _id AND p.status = 'needs_check' AND p.deleted_at IS NULL
    AND (public.is_admin() OR p.user_id = auth.uid()
         OR (p.workplace IS NOT NULL AND p.workplace = (SELECT name FROM public.profiles WHERE id = auth.uid()))
         OR (p.workplace IS NOT NULL AND p.workplace = public.my_workplace()));
END; $$;
REVOKE EXECUTE ON FUNCTION public.mark_purchase_checked(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.mark_purchase_checked(uuid) TO authenticated;

-- 職場 = アカウント名
CREATE OR REPLACE FUNCTION public.my_workplace()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT name FROM public.profiles WHERE id = auth.uid() $$;

CREATE OR REPLACE FUNCTION public.purchases_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.workplace := COALESCE((SELECT name FROM public.profiles WHERE id = NEW.user_id), NEW.workplace);
    IF NOT public.is_admin() THEN
      NEW.status := 'pending'; NEW.supplier := NULL; NEW.delivered_on := NULL; NEW.amount := NULL;
      NEW.check_reason := NULL;
      NEW.written_on := (now() AT TIME ZONE 'Asia/Tokyo')::date;
    END IF;
  ELSE
    NEW.updated_at := now();
    IF NOT public.is_admin() THEN
      IF NOT (OLD.status = 'needs_check' AND NEW.status = 'checked') THEN
        NEW.status := OLD.status;
      END IF;
      NEW.supplier := OLD.supplier; NEW.delivered_on := OLD.delivered_on;
      NEW.amount := OLD.amount; NEW.workplace := OLD.workplace; NEW.written_on := OLD.written_on;
      NEW.user_id := OLD.user_id; NEW.check_reason := OLD.check_reason;
    END IF;
  END IF;
  IF NEW.delivered_on IS NOT NULL THEN
    NEW.status := 'delivered';
  ELSIF NEW.status = 'delivered' THEN
    NEW.status := 'approved';
  END IF;
  RETURN NEW;
END;
$$;