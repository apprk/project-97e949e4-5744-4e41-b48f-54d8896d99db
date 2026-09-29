-- 1. profiles: 職場名（追加のみ）
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS workplace text;

-- 2. アカウント別 利用可能モード
CREATE TABLE public.account_modes (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mode text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, mode)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_modes TO authenticated;
GRANT ALL ON public.account_modes TO service_role;
ALTER TABLE public.account_modes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "modes select own or admin" ON public.account_modes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "modes insert admin" ON public.account_modes FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "modes delete admin" ON public.account_modes FOR DELETE TO authenticated USING (public.is_admin());

-- 既存の一般アカウントに初期モード（写真・物品購入）
INSERT INTO public.account_modes (user_id, mode)
SELECT p.id, m.mode FROM public.profiles p
CROSS JOIN (VALUES ('photos'), ('purchases')) AS m(mode)
WHERE NOT public.has_role(p.id, 'admin')
ON CONFLICT DO NOTHING;

-- 新規アカウント作成時の既定モード（既存処理は維持して追加）
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_slug text; v_name text; v_count int;
BEGIN
  v_slug := COALESCE(NEW.raw_user_meta_data->>'slug', split_part(NEW.email, '@', 1));
  v_name := COALESCE(NEW.raw_user_meta_data->>'name', v_slug);

  INSERT INTO public.profiles (id, name, slug, workplace)
  VALUES (NEW.id, v_name, v_slug, NULLIF(NEW.raw_user_meta_data->>'workplace', ''))
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.user_roles;
  IF v_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.account_modes (user_id, mode) VALUES (NEW.id, 'photos'), (NEW.id, 'purchases')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. 初期認証（端末ゲート）: 管理者のみ変更。読み取りはサーバーのみ
CREATE TABLE public.app_gate (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  login_id text NOT NULL,
  pass_salt text NOT NULL,
  pass_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_gate TO service_role;
ALTER TABLE public.app_gate ENABLE ROW LEVEL SECURITY;

-- 4. 記載者マスタ
CREATE TABLE public.purchase_writers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kana text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_writers TO authenticated;
GRANT ALL ON public.purchase_writers TO service_role;
ALTER TABLE public.purchase_writers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "writers read" ON public.purchase_writers FOR SELECT TO authenticated USING (true);
CREATE POLICY "writers admin insert" ON public.purchase_writers FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "writers admin update" ON public.purchase_writers FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "writers admin delete" ON public.purchase_writers FOR DELETE TO authenticated USING (public.is_admin());

-- 5. 物品購入
CREATE OR REPLACE FUNCTION public.my_workplace()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT workplace FROM public.profiles WHERE id = auth.uid() $$;

CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workplace text,
  written_on date NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Tokyo')::date),
  writer text NOT NULL DEFAULT '',
  item_name text NOT NULL DEFAULT '',
  model text,
  note text,
  quantity numeric,
  unit text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','delivered')),
  supplier text,
  delivered_on date,
  amount numeric,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.purchases (written_on);
CREATE INDEX ON public.purchases (workplace);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases select" ON public.purchases FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid() OR (workplace IS NOT NULL AND workplace = public.my_workplace()));
CREATE POLICY "purchases insert own" ON public.purchases FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "purchases update" ON public.purchases FOR UPDATE TO authenticated
  USING (public.is_admin() OR (user_id = auth.uid() AND status = 'pending'))
  WITH CHECK (public.is_admin() OR user_id = auth.uid());
CREATE POLICY "purchases delete" ON public.purchases FOR DELETE TO authenticated
  USING (public.is_admin() OR (user_id = auth.uid() AND status = 'pending'));

CREATE OR REPLACE FUNCTION public.purchases_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.workplace := COALESCE((SELECT workplace FROM public.profiles WHERE id = NEW.user_id), NEW.workplace);
    IF NOT public.is_admin() THEN
      NEW.status := 'pending'; NEW.supplier := NULL; NEW.delivered_on := NULL; NEW.amount := NULL;
      NEW.written_on := (now() AT TIME ZONE 'Asia/Tokyo')::date;
    END IF;
  ELSE
    NEW.updated_at := now();
    IF NOT public.is_admin() THEN
      NEW.status := OLD.status; NEW.supplier := OLD.supplier; NEW.delivered_on := OLD.delivered_on;
      NEW.amount := OLD.amount; NEW.workplace := OLD.workplace; NEW.written_on := OLD.written_on;
      NEW.user_id := OLD.user_id;
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
CREATE TRIGGER purchases_guard_trg BEFORE INSERT OR UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.purchases_guard();