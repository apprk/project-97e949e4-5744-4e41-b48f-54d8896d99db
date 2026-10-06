CREATE OR REPLACE FUNCTION public.purchases_guard()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF public.is_admin() THEN
      NEW.workplace := NULL;
    ELSE
      NEW.workplace := (SELECT NULLIF(workplace, '') FROM public.profiles WHERE id = NEW.user_id);
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
    VALUES (NEW.id, 'photos'), (NEW.id, 'purchases'), (NEW.id, 'purchases.entry'), (NEW.id, 'purchases.history'), (NEW.id, 'settings')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

-- 既存アカウントは今まで通り設定（パスワード変更等）を使えるように
INSERT INTO public.account_modes (user_id, mode)
SELECT p.id, 'settings' FROM public.profiles p
WHERE NOT public.has_role(p.id, 'admin')
  AND NOT EXISTS (SELECT 1 FROM public.account_modes m WHERE m.user_id = p.id AND m.mode = 'settings');

DROP POLICY IF EXISTS "writers admin insert" ON public.purchase_writers;
DROP POLICY IF EXISTS "writers admin update" ON public.purchase_writers;
DROP POLICY IF EXISTS "writers admin delete" ON public.purchase_writers;
CREATE POLICY "writers admin insert" ON public.purchase_writers FOR INSERT TO authenticated WITH CHECK (public.has_perm('settings.writers'));
CREATE POLICY "writers admin update" ON public.purchase_writers FOR UPDATE TO authenticated USING (public.has_perm('settings.writers')) WITH CHECK (public.has_perm('settings.writers'));
CREATE POLICY "writers admin delete" ON public.purchase_writers FOR DELETE TO authenticated USING (public.has_perm('settings.writers'));

DROP POLICY IF EXISTS "suppliers admin" ON public.purchase_suppliers;
CREATE POLICY "suppliers admin" ON public.purchase_suppliers FOR ALL TO authenticated USING (public.has_perm('settings.suppliers')) WITH CHECK (public.has_perm('settings.suppliers'));