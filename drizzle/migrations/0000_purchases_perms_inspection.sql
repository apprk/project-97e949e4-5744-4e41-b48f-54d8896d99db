-- 細かい権限（account_modes に "モード.操作" キーで格納）
CREATE OR REPLACE FUNCTION public.has_perm(_perm text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin() OR EXISTS (SELECT 1 FROM public.account_modes WHERE user_id = auth.uid() AND mode = _perm)
$$;

-- 既存の物品購入利用者に記入・履歴権限を付与（現状維持）
INSERT INTO public.account_modes (user_id, mode)
SELECT user_id, 'purchases.entry' FROM public.account_modes WHERE mode = 'purchases'
ON CONFLICT DO NOTHING;
INSERT INTO public.account_modes (user_id, mode)
SELECT user_id, 'purchases.history' FROM public.account_modes WHERE mode = 'purchases'
ON CONFLICT DO NOTHING;

-- 職場名：アカウント名を初期値とし、以後は profiles.workplace を使用
UPDATE public.profiles SET workplace = name WHERE workplace IS NULL;

CREATE OR REPLACE FUNCTION public.my_workplace()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(workplace, '') FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.profiles_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    NEW.workplace := OLD.workplace;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS profiles_guard_trg ON public.profiles;
CREATE TRIGGER profiles_guard_trg BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.profiles_guard();

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_slug text; v_name text; v_count int;
BEGIN
  v_slug := COALESCE(NEW.raw_user_meta_data->>'slug', split_part(NEW.email, '@', 1));
  v_name := COALESCE(NEW.raw_user_meta_data->>'name', v_slug);

  INSERT INTO public.profiles (id, name, slug, workplace)
  VALUES (NEW.id, v_name, v_slug,
    CASE WHEN NEW.raw_user_meta_data ? 'workplace' THEN NULLIF(NEW.raw_user_meta_data->>'workplace', '') ELSE v_name END)
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.user_roles;
  IF v_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.account_modes (user_id, mode)
    VALUES (NEW.id, 'photos'), (NEW.id, 'purchases'), (NEW.id, 'purchases.entry'), (NEW.id, 'purchases.history')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- 購入：職場は現在の職場名（空欄可）。過去行は変更しない
CREATE OR REPLACE FUNCTION public.purchases_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.workplace := (SELECT NULLIF(workplace, '') FROM public.profiles WHERE id = NEW.user_id);
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
$function$;

DROP POLICY IF EXISTS "purchases select" ON public.purchases;
CREATE POLICY "purchases select" ON public.purchases FOR SELECT TO authenticated
USING (public.is_admin() OR user_id = auth.uid()
  OR public.has_perm('purchases.all_workplaces')
  OR (workplace IS NOT NULL AND workplace = public.my_workplace()));

-- 管理者専用項目（見積書・検収番号・業者番号）
CREATE TABLE public.purchase_admin_fields (
  purchase_id uuid PRIMARY KEY REFERENCES public.purchases(id),
  estimate_no text,
  inspection_no text,
  vendor_no text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_admin_fields TO authenticated;
GRANT ALL ON public.purchase_admin_fields TO service_role;
ALTER TABLE public.purchase_admin_fields ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin fields admin" ON public.purchase_admin_fields FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 発注先マスタ
CREATE TABLE public.purchase_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  vendor_no text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_suppliers TO authenticated;
GRANT ALL ON public.purchase_suppliers TO service_role;
ALTER TABLE public.purchase_suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "suppliers admin" ON public.purchase_suppliers FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 写真添付（端末アップロード or 既存写真の参照）
CREATE TABLE public.purchase_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL REFERENCES public.purchases(id),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  photo_id uuid REFERENCES public.photos(id),
  storage_path text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_attachments_purchase_idx ON public.purchase_attachments(purchase_id);
GRANT SELECT, INSERT, UPDATE ON public.purchase_attachments TO authenticated;
GRANT ALL ON public.purchase_attachments TO service_role;
ALTER TABLE public.purchase_attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attachments select" ON public.purchase_attachments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id));
CREATE POLICY "attachments insert" ON public.purchase_attachments FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND (public.is_admin() OR EXISTS (SELECT 1 FROM public.purchases p WHERE p.id = purchase_id AND p.user_id = auth.uid())));
CREATE POLICY "attachments update" ON public.purchase_attachments FOR UPDATE TO authenticated
USING (public.is_admin() OR user_id = auth.uid()) WITH CHECK (public.is_admin() OR user_id = auth.uid());