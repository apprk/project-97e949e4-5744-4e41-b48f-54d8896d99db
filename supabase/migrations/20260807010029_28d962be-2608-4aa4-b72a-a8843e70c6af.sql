-- roles
CREATE TYPE public.app_role AS ENUM ('admin','user');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);
GRANT SELECT, INSERT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- profiles policies (account list must be visible before login: names only)
CREATE POLICY "profiles readable" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "profiles insert self" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles update self or admin" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "profiles delete admin" ON public.profiles FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "roles select own or admin" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "roles insert self bootstrap" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- generic updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- schedules
CREATE TABLE public.schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  size text,
  comment_category text,
  operation_comment text,
  repair_item text,
  new_effort text,
  quality text,
  personal_plan text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.schedules (entry_date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schedules TO authenticated;
GRANT ALL ON public.schedules TO service_role;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "schedules own or admin" ON public.schedules FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE TRIGGER schedules_touch BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- photo folders
CREATE TABLE public.photo_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photo_folders TO authenticated;
GRANT ALL ON public.photo_folders TO service_role;
ALTER TABLE public.photo_folders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "folders own or admin" ON public.photo_folders FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- equipment
CREATE TABLE public.equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  content text,
  cycle_value integer,
  cycle_unit text CHECK (cycle_unit IN ('year','month','week')),
  first_date date,
  next_date date,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment TO authenticated;
GRANT ALL ON public.equipment TO service_role;
ALTER TABLE public.equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY "equipment own or admin" ON public.equipment FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE TRIGGER equipment_touch BEFORE UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.equipment_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  equipment_id uuid NOT NULL REFERENCES public.equipment(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  performed_on date NOT NULL,
  comment text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.equipment_history (equipment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipment_history TO authenticated;
GRANT ALL ON public.equipment_history TO service_role;
ALTER TABLE public.equipment_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "history own or admin" ON public.equipment_history FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- photos
CREATE TABLE public.photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES public.photo_folders(id) ON DELETE SET NULL,
  schedule_id uuid REFERENCES public.schedules(id) ON DELETE SET NULL,
  history_id uuid REFERENCES public.equipment_history(id) ON DELETE SET NULL,
  storage_path text NOT NULL,
  comment text,
  taken_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.photos (user_id, taken_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.photos TO authenticated;
GRANT ALL ON public.photos TO service_role;
ALTER TABLE public.photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photos own or admin" ON public.photos FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- settings
CREATE TABLE public.app_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  password_skip_days integer NOT NULL DEFAULT 0,
  trash_retention_days integer NOT NULL DEFAULT 30,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings own or admin" ON public.app_settings FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());
CREATE TRIGGER settings_touch BEFORE UPDATE ON public.app_settings FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- storage policies for photos bucket (bucket created via tool)
CREATE POLICY "photo objects select" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'photos' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));
CREATE POLICY "photo objects insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "photo objects delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'photos' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_admin()));