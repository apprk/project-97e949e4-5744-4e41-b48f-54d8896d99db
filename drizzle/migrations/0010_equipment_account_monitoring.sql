CREATE TABLE public.equipment_view_sessions (
 session_id uuid PRIMARY KEY, user_id uuid NOT NULL, target_user_id uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.equipment_view_sessions TO authenticated;
GRANT ALL ON public.equipment_view_sessions TO service_role;
ALTER TABLE public.equipment_view_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY equipment_view_session_read ON public.equipment_view_sessions FOR SELECT TO authenticated USING (user_id=auth.uid() AND session_id::text=auth.jwt()->>'session_id');
CREATE FUNCTION public.equipment_view_target() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT target_user_id FROM public.equipment_view_sessions WHERE user_id=auth.uid() AND session_id::text=auth.jwt()->>'session_id' $$;
CREATE FUNCTION public.equipment_view_active() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.equipment_view_target() IS NOT NULL $$;
CREATE FUNCTION public.equipment_target_allowed(_target uuid, _write boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT auth.uid() IS NOT NULL AND public.has_perm('equipment') AND EXISTS(SELECT 1 FROM profiles WHERE id=_target AND disabled_at IS NULL) AND
 (_target=auth.uid() OR (NOT public.is_admin_account(_target) AND (public.is_admin() OR (NOT _write AND NOT public.is_admin_account(auth.uid()) AND EXISTS(SELECT 1 FROM account_modes WHERE user_id=auth.uid() AND mode='equipment.monitor')))))
$$;
CREATE FUNCTION public.equipment_accounts() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY created_at),'[]'::jsonb) FROM profiles WHERE public.equipment_target_allowed(id,false) $$;
CREATE FUNCTION public.set_equipment_target(_target uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sid uuid;
BEGIN
 IF auth.uid() IS NULL OR nullif(auth.jwt()->>'session_id','') IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;
 sid:=(auth.jwt()->>'session_id')::uuid;
 IF _target IS NULL OR _target=auth.uid() THEN DELETE FROM equipment_view_sessions WHERE session_id=sid AND user_id=auth.uid(); RETURN auth.uid(); END IF;
 IF NOT public.equipment_target_allowed(_target,false) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 INSERT INTO equipment_view_sessions(session_id,user_id,target_user_id) VALUES(sid,auth.uid(),_target) ON CONFLICT(session_id) DO UPDATE SET target_user_id=excluded.target_user_id,updated_at=now() WHERE equipment_view_sessions.user_id=auth.uid();
 RETURN _target;
END $$;
CREATE OR REPLACE FUNCTION public.has_perm(_perm text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT (NOT public.equipment_view_active() OR _perm IN ('equipment','equipment.monitor')) AND (public.is_admin() OR EXISTS (SELECT 1 FROM public.account_modes WHERE user_id=auth.uid() AND (mode=_perm OR (_perm='purchases.settings' AND mode IN ('settings.writers','settings.suppliers','settings.analytics'))))) $$;
REVOKE ALL ON FUNCTION public.equipment_view_target(), public.equipment_view_active(), public.equipment_target_allowed(uuid,boolean), public.equipment_accounts(), public.set_equipment_target(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.equipment_view_target(), public.equipment_view_active(), public.equipment_target_allowed(uuid,boolean), public.equipment_accounts(), public.set_equipment_target(uuid) TO authenticated,service_role;
CREATE POLICY equipment_monitor_read ON public.equipment FOR SELECT TO authenticated USING (public.equipment_view_target()=user_id AND deleted_at IS NULL AND public.equipment_target_allowed(user_id,false));
CREATE POLICY equipment_target_scope ON public.equipment AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.equipment_view_active() OR (user_id=public.equipment_view_target() AND public.equipment_target_allowed(user_id,false))) WITH CHECK (NOT public.equipment_view_active() OR (user_id=public.equipment_view_target() AND public.equipment_target_allowed(user_id,true)));
CREATE POLICY history_monitor_read ON public.equipment_history FOR SELECT TO authenticated USING (public.equipment_view_target()=user_id AND deleted_at IS NULL AND public.equipment_target_allowed(user_id,false) AND EXISTS(SELECT 1 FROM equipment e WHERE e.id=equipment_id AND e.deleted_at IS NULL));
CREATE POLICY history_target_scope ON public.equipment_history AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.equipment_view_active() OR (user_id=public.equipment_view_target() AND public.equipment_target_allowed(user_id,false))) WITH CHECK (NOT public.equipment_view_active() OR (user_id=public.equipment_view_target() AND public.equipment_target_allowed(user_id,true)));
CREATE POLICY display_monitor_read ON public.equipment_display_settings FOR SELECT TO authenticated USING (user_id=public.equipment_view_target() AND public.equipment_target_allowed(user_id,false));
CREATE POLICY display_target_scope ON public.equipment_display_settings AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.equipment_view_active() OR user_id=public.equipment_view_target()) WITH CHECK (NOT public.equipment_view_active());
CREATE POLICY names_no_monitor_writes ON public.equipment_names AS RESTRICTIVE FOR ALL TO authenticated USING (true) WITH CHECK (NOT public.equipment_view_active());
CREATE POLICY attachments_monitor_read ON public.equipment_history_attachments FOR SELECT TO authenticated USING (public.equipment_view_active() AND EXISTS(SELECT 1 FROM equipment_history h JOIN equipment e ON e.id=h.equipment_id WHERE h.id=history_id AND h.deleted_at IS NULL AND e.deleted_at IS NULL AND e.user_id=public.equipment_view_target() AND public.equipment_target_allowed(e.user_id,false)));
CREATE POLICY attachments_target_scope ON public.equipment_history_attachments AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.equipment_view_active() OR EXISTS(SELECT 1 FROM equipment_history h WHERE h.id=history_id AND h.user_id=public.equipment_view_target())) WITH CHECK (NOT public.equipment_view_active() OR (public.is_admin() AND EXISTS(SELECT 1 FROM equipment_history h WHERE h.id=history_id AND h.user_id=public.equipment_view_target())));
CREATE OR REPLACE FUNCTION public.maintenance_history_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND NOT EXISTS(SELECT 1 FROM equipment e WHERE e.id=NEW.equipment_id AND e.deleted_at IS NULL AND e.user_id=NEW.user_id AND public.equipment_target_allowed(e.user_id,true) AND (NOT public.equipment_view_active() OR e.user_id=public.equipment_view_target())) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF TG_OP='UPDATE' AND (NEW.equipment_id IS DISTINCT FROM OLD.equipment_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN RAISE EXCEPTION 'History identity cannot change'; END IF;
 RETURN NEW;
END $$;
CREATE FUNCTION public.maintenance_equipment_identity_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$ BEGIN IF TG_OP='UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN RAISE EXCEPTION 'Equipment owner cannot change'; END IF; RETURN NEW; END $$;
CREATE TRIGGER maintenance_equipment_identity BEFORE UPDATE ON public.equipment FOR EACH ROW EXECUTE FUNCTION public.maintenance_equipment_identity_guard();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['schedules','schedule_day_marks','purchases','purchase_admin_fields','purchase_attachments','purchase_suppliers','purchase_writers','photo_folders','photo_folder_items','app_settings','account_pins'] LOOP
 EXECUTE format('CREATE POLICY equipment_view_blocks_other_modes ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.equipment_view_active()) WITH CHECK (NOT public.equipment_view_active())',t);
 END LOOP;
END $$;
CREATE POLICY equipment_view_photo_scope ON public.photos AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.equipment_view_active() OR (public.is_admin() AND user_id=public.equipment_view_target())) WITH CHECK (NOT public.equipment_view_active());
CREATE POLICY equipment_view_profiles_scope ON public.profiles AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.equipment_view_active() OR id=auth.uid()) WITH CHECK (NOT public.equipment_view_active());
CREATE POLICY equipment_view_modes_scope ON public.account_modes AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.equipment_view_active() OR user_id=auth.uid()) WITH CHECK (NOT public.equipment_view_active());
CREATE POLICY equipment_view_roles_scope ON public.user_roles AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.equipment_view_active() OR user_id=auth.uid()) WITH CHECK (NOT public.equipment_view_active());
CREATE POLICY equipment_view_storage_select ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT public.equipment_view_active() OR (public.is_admin() AND (storage.foldername(name))[1]=public.equipment_view_target()::text));
CREATE POLICY equipment_view_storage_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.equipment_view_active() OR (public.is_admin() AND bucket_id='photos' AND (storage.foldername(name))[1]=auth.uid()::text AND (storage.filename(name)) LIKE 'maintenance-%'));
CREATE POLICY equipment_view_storage_delete ON storage.objects AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.equipment_view_active() OR (public.is_admin() AND bucket_id='photos' AND (storage.foldername(name))[1]=auth.uid()::text AND (storage.filename(name)) LIKE 'maintenance-%'));
CREATE POLICY equipment_view_storage_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.equipment_view_active()) WITH CHECK (NOT public.equipment_view_active());