CREATE OR REPLACE FUNCTION public.has_perm(_perm text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_admin() OR EXISTS (SELECT 1 FROM public.account_modes WHERE user_id=auth.uid() AND (mode=_perm OR (_perm='purchases.settings' AND mode IN ('settings.writers','settings.suppliers','settings.analytics')))) $$;
CREATE OR REPLACE FUNCTION public.purchase_visible(_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.purchases p WHERE p.id=_id AND (public.is_admin() OR p.user_id=auth.uid() OR public.has_perm('purchases.all_workplaces') OR p.workplace=public.my_workplace())) $$;
CREATE OR REPLACE FUNCTION public.purchase_rows() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT COALESCE(jsonb_agg((to_jsonb(p)-'supplier') || jsonb_build_object('supplier',CASE WHEN public.has_perm('purchases.fulfillment') OR public.has_perm('purchases.settings') OR public.has_perm('purchases.transfer') OR public.has_perm('purchases.inspection') THEN p.supplier ELSE NULL END,'estimate_no',CASE WHEN public.has_perm('purchases.estimate') OR public.has_perm('purchases.transfer') THEN a.estimate_no ELSE NULL END,'inspection_no',CASE WHEN public.has_perm('purchases.inspection') THEN a.inspection_no ELSE NULL END,'vendor_no',CASE WHEN public.has_perm('purchases.inspection') THEN a.vendor_no ELSE NULL END) ORDER BY p.written_on,p.created_at),'[]'::jsonb) FROM public.purchases p LEFT JOIN public.purchase_admin_fields a ON a.purchase_id=p.id WHERE auth.uid() IS NOT NULL AND public.has_perm('purchases') AND p.deleted_at IS NULL AND public.purchase_visible(p.id) $$;
GRANT EXECUTE ON FUNCTION public.purchase_rows() TO authenticated;
REVOKE ALL ON FUNCTION public.purchase_rows() FROM anon;
REVOKE SELECT ON public.purchases FROM authenticated;
GRANT SELECT(id,user_id,workplace,written_on,writer,item_name,model,note,quantity,unit,status,delivered_on,amount,deleted_at,created_at,updated_at,check_reason) ON public.purchases TO authenticated;
CREATE OR REPLACE FUNCTION public.save_purchase_estimate(_id uuid,_value text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.has_perm('purchases') OR NOT public.has_perm('purchases.estimate') OR NOT public.purchase_visible(_id) OR COALESCE(_value,'') !~ '^\d{0,3}$' THEN RAISE EXCEPTION 'Forbidden'; END IF; INSERT INTO public.purchase_admin_fields(purchase_id,estimate_no) VALUES(_id,NULLIF(_value,'')) ON CONFLICT(purchase_id) DO UPDATE SET estimate_no=EXCLUDED.estimate_no,updated_at=now(); END $$;
GRANT EXECUTE ON FUNCTION public.save_purchase_estimate(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.save_purchase_estimate(uuid,text) FROM anon;
DROP POLICY IF EXISTS "purchases update" ON public.purchases;
CREATE POLICY "purchases update" ON public.purchases FOR UPDATE TO authenticated USING (public.has_perm('purchases') AND public.purchase_visible(id) AND (public.is_admin() OR (user_id=auth.uid() AND status='pending') OR public.has_perm('purchases.workplace_edit') OR public.has_perm('purchases.status') OR public.has_perm('purchases.fulfillment'))) WITH CHECK (public.has_perm('purchases') AND (public.is_admin() OR public.purchase_visible(id) OR user_id=auth.uid()));
CREATE OR REPLACE FUNCTION public.purchases_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE imported boolean := COALESCE(current_setting('sanjo.purchase_import',true),'')='on';
BEGIN
 IF NOT public.has_perm('purchases') THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF TG_OP='INSERT' THEN
  IF NOT imported AND NOT public.is_admin() THEN
   IF NOT public.has_perm('purchases.entry') AND NOT public.has_perm('purchases.inspection') THEN RAISE EXCEPTION 'Forbidden'; END IF;
   IF NOT public.has_perm('purchases.workplace_edit') THEN NEW.workplace:=public.my_workplace(); ELSIF NULLIF(btrim(NEW.workplace),'') IS NULL AND NOT public.has_perm('purchases.workplace_blank') THEN RAISE EXCEPTION 'Workplace cannot be blank'; END IF;
   NEW.written_on:=(now() AT TIME ZONE 'Asia/Tokyo')::date;
   NEW.status:=CASE WHEN public.has_perm('purchases.inspection') AND NEW.status='approved' THEN 'approved' ELSE 'pending' END;
   IF NOT public.has_perm('purchases.fulfillment') THEN NEW.supplier:=NULL; NEW.delivered_on:=NULL; NEW.amount:=NULL; END IF;
   NEW.check_reason:=NULL;
  END IF;
 ELSE
  NEW.updated_at:=now();
  IF NOT public.is_admin() THEN
   IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.written_on IS DISTINCT FROM OLD.written_on THEN RAISE EXCEPTION 'Forbidden'; END IF;
   IF (NEW.writer,NEW.item_name,NEW.model,NEW.note,NEW.quantity,NEW.unit,NEW.deleted_at) IS DISTINCT FROM (OLD.writer,OLD.item_name,OLD.model,OLD.note,OLD.quantity,OLD.unit,OLD.deleted_at) AND NOT (OLD.user_id=auth.uid() AND OLD.status='pending') THEN RAISE EXCEPTION 'Forbidden'; END IF;
   IF NEW.workplace IS DISTINCT FROM OLD.workplace THEN
    IF NOT public.has_perm('purchases.workplace_edit') THEN RAISE EXCEPTION 'Forbidden'; END IF;
    IF NULLIF(btrim(NEW.workplace),'') IS NULL AND NOT public.has_perm('purchases.workplace_blank') THEN RAISE EXCEPTION 'Workplace cannot be blank'; END IF;
   END IF;
   IF (NEW.supplier,NEW.delivered_on,NEW.amount) IS DISTINCT FROM (OLD.supplier,OLD.delivered_on,OLD.amount) AND NOT public.has_perm('purchases.fulfillment') THEN RAISE EXCEPTION 'Forbidden'; END IF;
   IF (NEW.status,NEW.check_reason) IS DISTINCT FROM (OLD.status,OLD.check_reason) AND NOT public.has_perm('purchases.status') THEN RAISE EXCEPTION 'Forbidden'; END IF;
  END IF;
 END IF;
 IF NEW.status NOT IN ('pending','approved','rejected','needs_check','checked','delivered') THEN RAISE EXCEPTION 'Invalid status'; END IF;
 IF NEW.delivered_on IS NOT NULL THEN NEW.status:='delivered'; ELSIF TG_OP='UPDATE' AND OLD.delivered_on IS NOT NULL AND NEW.status='delivered' THEN NEW.status:='approved'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.refresh_purchase_vendor() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE no text; BEGIN IF TG_OP='INSERT' OR NEW.supplier IS DISTINCT FROM OLD.supplier THEN SELECT vendor_no INTO no FROM public.purchase_suppliers WHERE name=btrim(NEW.supplier) LIMIT 1; INSERT INTO public.purchase_admin_fields(purchase_id,vendor_no) VALUES(NEW.id,no) ON CONFLICT(purchase_id) DO UPDATE SET vendor_no=EXCLUDED.vendor_no,updated_at=now(); END IF; RETURN NEW; END $$;
CREATE TRIGGER purchase_vendor_refresh AFTER INSERT OR UPDATE OF supplier ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.refresh_purchase_vendor();
CREATE OR REPLACE FUNCTION public.mark_purchase_checked(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT public.has_perm('purchases') OR NOT public.has_perm('purchases.status') OR NOT public.purchase_visible(_id) THEN RAISE EXCEPTION 'Forbidden'; END IF; UPDATE public.purchases SET status='checked' WHERE id=_id AND status='needs_check' AND deleted_at IS NULL; END $$;
DROP POLICY IF EXISTS "writers admin insert" ON public.purchase_writers;
DROP POLICY IF EXISTS "writers admin update" ON public.purchase_writers;
DROP POLICY IF EXISTS "writers admin delete" ON public.purchase_writers;
CREATE POLICY "writers admin insert" ON public.purchase_writers FOR INSERT TO authenticated WITH CHECK(public.has_perm('purchases') AND public.has_perm('purchases.settings'));
CREATE POLICY "writers admin update" ON public.purchase_writers FOR UPDATE TO authenticated USING(public.has_perm('purchases.settings')) WITH CHECK(public.has_perm('purchases.settings'));
CREATE POLICY "writers admin delete" ON public.purchase_writers FOR DELETE TO authenticated USING(public.has_perm('purchases.settings'));
DROP POLICY IF EXISTS "suppliers admin" ON public.purchase_suppliers;
CREATE POLICY "suppliers read" ON public.purchase_suppliers FOR SELECT TO authenticated USING(public.has_perm('purchases') AND (public.has_perm('purchases.settings') OR public.has_perm('purchases.fulfillment') OR public.has_perm('purchases.inspection')));
CREATE POLICY "suppliers write" ON public.purchase_suppliers FOR ALL TO authenticated USING(public.has_perm('purchases') AND public.has_perm('purchases.settings')) WITH CHECK(public.has_perm('purchases') AND public.has_perm('purchases.settings'));
CREATE POLICY "purchase module required" ON public.purchases AS RESTRICTIVE FOR ALL TO authenticated USING(public.has_perm('purchases')) WITH CHECK(public.has_perm('purchases'));
CREATE POLICY "settings permission required" ON public.app_settings AS RESTRICTIVE FOR ALL TO authenticated USING(public.has_perm('settings')) WITH CHECK(public.has_perm('settings'));
DO $$ DECLARE t text; m text; BEGIN FOR t,m IN VALUES ('schedules','schedule'),('schedule_day_marks','schedule'),('photos','photos'),('photo_folders','photos'),('photo_folder_items','photos'),('equipment','equipment'),('equipment_history','equipment') LOOP EXECUTE format('CREATE POLICY "module permission required" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (public.has_perm(%L) OR public.has_perm(''trash'')) WITH CHECK (public.has_perm(%L) OR public.has_perm(''trash''))',t,m,m); END LOOP; END $$;
CREATE OR REPLACE FUNCTION public.import_purchases(_rows jsonb) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r jsonb; pid uuid; n integer:=0; BEGIN IF auth.uid() IS NULL OR NOT public.has_perm('purchases') OR NOT public.has_perm('purchases.transfer') THEN RAISE EXCEPTION 'Forbidden'; END IF; IF jsonb_typeof(_rows)!='array' OR jsonb_array_length(_rows)>200 THEN RAISE EXCEPTION 'Invalid rows'; END IF; PERFORM set_config('sanjo.purchase_import','on',true); FOR r IN SELECT value FROM jsonb_array_elements(_rows) LOOP IF NULLIF(btrim(r->>'item_name'),'') IS NULL OR NULLIF(r->>'written_on','') IS NULL THEN RAISE EXCEPTION 'Invalid row'; END IF; IF COALESCE(r->>'estimate_no','') !~ '^\d{0,3}$' THEN RAISE EXCEPTION 'Invalid estimate'; END IF; INSERT INTO public.purchases(user_id,workplace,written_on,writer,item_name,model,note,quantity,unit,status,supplier,delivered_on,amount) VALUES(auth.uid(),NULL,(r->>'written_on')::date,COALESCE(r->>'writer',''),r->>'item_name',NULLIF(r->>'model',''),NULLIF(r->>'note',''),(r->>'quantity')::numeric,NULLIF(r->>'unit',''),'delivered',NULLIF(r->>'supplier',''),NULLIF(r->>'delivered_on','')::date,(r->>'amount')::numeric) RETURNING id INTO pid; INSERT INTO public.purchase_admin_fields(purchase_id,estimate_no) VALUES(pid,NULLIF(r->>'estimate_no','')) ON CONFLICT(purchase_id) DO UPDATE SET estimate_no=EXCLUDED.estimate_no; n:=n+1; END LOOP; PERFORM set_config('sanjo.purchase_import','off',true); RETURN n; END $$;
GRANT EXECUTE ON FUNCTION public.import_purchases(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.import_purchases(jsonb) FROM anon;