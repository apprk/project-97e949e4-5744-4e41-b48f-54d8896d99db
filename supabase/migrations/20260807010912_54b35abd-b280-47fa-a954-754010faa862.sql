-- 新規アカウント作成時に profiles を自動作成（signUp メタデータから）
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text;
  v_name text;
  v_count int;
BEGIN
  v_slug := COALESCE(NEW.raw_user_meta_data->>'slug', split_part(NEW.email, '@', 1));
  v_name := COALESCE(NEW.raw_user_meta_data->>'name', v_slug);

  INSERT INTO public.profiles (id, name, slug)
  VALUES (NEW.id, v_name, v_slug)
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.user_roles;
  IF v_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();