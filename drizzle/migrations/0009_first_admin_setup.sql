CREATE TABLE public.admin_setup_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  claim_id uuid NOT NULL,
  completed_at timestamptz
);
GRANT ALL ON public.admin_setup_state TO service_role;
ALTER TABLE public.admin_setup_state ENABLE ROW LEVEL SECURITY;
INSERT INTO public.admin_setup_state (id, claim_id, completed_at)
SELECT 1, gen_random_uuid(), now() WHERE EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_first_admin_setup(_claim uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(731026, 1);
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') OR EXISTS (SELECT 1 FROM public.admin_setup_state) THEN RETURN false; END IF;
  INSERT INTO public.admin_setup_state (id, claim_id) VALUES (1, _claim);
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.finish_first_admin_setup(_claim uuid, _user uuid, _session uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(731026, 1);
  IF NOT EXISTS (SELECT 1 FROM public.admin_setup_state WHERE id = 1 AND claim_id = _claim AND completed_at IS NULL) OR EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN RAISE EXCEPTION 'Setup unavailable'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user) THEN RAISE EXCEPTION 'Profile missing'; END IF;
  INSERT INTO public.admin_auth_state (user_id) VALUES (_user);
  INSERT INTO public.admin_login_sessions (session_id, user_id, expires_at) VALUES (_session, _user, now() + interval '1 day');
  INSERT INTO public.user_roles (user_id, role) VALUES (_user, 'admin');
  UPDATE public.admin_setup_state SET completed_at = now() WHERE id = 1 AND claim_id = _claim;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.release_first_admin_setup(_claim uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(731026, 1);
  DELETE FROM public.admin_setup_state WHERE id = 1 AND claim_id = _claim AND completed_at IS NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.first_admin_setup_available() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.admin_setup_state) AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin');
$$;
REVOKE ALL ON FUNCTION public.claim_first_admin_setup(uuid), public.finish_first_admin_setup(uuid,uuid,uuid), public.release_first_admin_setup(uuid), public.first_admin_setup_available() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_admin_setup(uuid), public.finish_first_admin_setup(uuid,uuid,uuid), public.release_first_admin_setup(uuid), public.first_admin_setup_available() TO service_role;

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_slug text; v_name text;
BEGIN
  v_slug := COALESCE(NEW.raw_user_meta_data->>'slug', split_part(NEW.email, '@', 1));
  v_name := COALESCE(NEW.raw_user_meta_data->>'name', v_slug);
  INSERT INTO public.profiles (id, name, slug, workplace)
  VALUES (NEW.id, v_name, v_slug, CASE WHEN NEW.raw_user_meta_data ? 'workplace' THEN NULLIF(NEW.raw_user_meta_data->>'workplace', '') ELSE v_name END)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.account_modes (user_id, mode)
  VALUES (NEW.id, 'photos'), (NEW.id, 'purchases'), (NEW.id, 'purchases.entry'), (NEW.id, 'purchases.history'), (NEW.id, 'settings') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;