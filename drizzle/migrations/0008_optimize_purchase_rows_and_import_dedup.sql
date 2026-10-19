create or replace function public.purchase_rows() returns jsonb
language sql stable security definer set search_path = public as $$
with perms as materialized (
  select
    public.has_perm('purchases') as allowed,
    public.has_perm('purchases.fulfillment') or public.has_perm('purchases.settings') or public.has_perm('purchases.transfer') or public.has_perm('purchases.inspection') as see_supplier,
    public.has_perm('purchases.estimate') or public.has_perm('purchases.transfer') as see_estimate,
    public.has_perm('purchases.inspection') as see_inspection,
    public.is_admin() as admin,
    public.has_perm('purchases.all_workplaces') as all_wp,
    public.my_workplace() as wp
),
visible as (
  select p.*, a.estimate_no, a.inspection_no, a.vendor_no
  from public.purchases p
  left join public.purchase_admin_fields a on a.purchase_id = p.id
  cross join perms
  where auth.uid() is not null and perms.allowed and p.deleted_at is null
    and (perms.admin or p.user_id = auth.uid() or perms.all_wp or p.workplace = perms.wp)
)
select coalesce(jsonb_agg(
  (to_jsonb(v) - 'supplier' - 'estimate_no' - 'inspection_no' - 'vendor_no')
  || jsonb_build_object(
    'supplier', case when perms.see_supplier then v.supplier end,
    'estimate_no', case when perms.see_estimate then v.estimate_no end,
    'inspection_no', case when perms.see_inspection then v.inspection_no end,
    'vendor_no', case when perms.see_inspection then v.vendor_no end)
  order by v.written_on, v.created_at), '[]'::jsonb)
from visible v cross join perms
$$;

drop function public.import_purchases(jsonb);
create function public.import_purchases(_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb; pid uuid; n integer := 0; s integer := 0;
begin
  if auth.uid() is null or not public.has_perm('purchases') or not public.has_perm('purchases.transfer') then
    raise exception 'Forbidden';
  end if;
  if jsonb_typeof(_rows) <> 'array' or jsonb_array_length(_rows) > 200 then
    raise exception 'Invalid rows';
  end if;
  perform set_config('sanjo.purchase_import','on',true);
  for r in select value from jsonb_array_elements(_rows) loop
    if nullif(btrim(r->>'item_name'),'') is null or nullif(r->>'written_on','') is null then
      raise exception 'Invalid row';
    end if;
    if coalesce(r->>'estimate_no','') !~ '^\d{0,3}$' then
      raise exception 'Invalid estimate';
    end if;
    if exists (
      select 1 from public.purchases p
      where p.deleted_at is null
        and p.written_on = (r->>'written_on')::date
        and p.writer = coalesce(r->>'writer','')
        and p.item_name = r->>'item_name'
        and coalesce(p.model,'') = coalesce(nullif(r->>'model',''),'')
        and coalesce(p.note,'') = coalesce(nullif(r->>'note',''),'')
        and coalesce(p.quantity,-1) = coalesce((r->>'quantity')::numeric,-1)
        and coalesce(p.unit,'') = coalesce(nullif(r->>'unit',''),'')
        and coalesce(p.supplier,'') = coalesce(nullif(r->>'supplier',''),'')
        and coalesce(p.delivered_on,'0001-01-01'::date) = coalesce(nullif(r->>'delivered_on','')::date,'0001-01-01'::date)
        and coalesce(p.amount,-1) = coalesce((r->>'amount')::numeric,-1)
    ) then
      s := s + 1;
      continue;
    end if;
    insert into public.purchases(user_id,workplace,written_on,writer,item_name,model,note,quantity,unit,status,supplier,delivered_on,amount)
    values(auth.uid(),null,(r->>'written_on')::date,coalesce(r->>'writer',''),r->>'item_name',nullif(r->>'model',''),nullif(r->>'note',''),(r->>'quantity')::numeric,nullif(r->>'unit',''),'delivered',nullif(r->>'supplier',''),nullif(r->>'delivered_on','')::date,(r->>'amount')::numeric)
    returning id into pid;
    insert into public.purchase_admin_fields(purchase_id,estimate_no) values(pid,nullif(r->>'estimate_no',''))
    on conflict(purchase_id) do update set estimate_no = excluded.estimate_no;
    n := n + 1;
  end loop;
  perform set_config('sanjo.purchase_import','off',true);
  return jsonb_build_object('inserted', n, 'skipped', s);
end
$$;
grant execute on function public.import_purchases(jsonb) to authenticated;