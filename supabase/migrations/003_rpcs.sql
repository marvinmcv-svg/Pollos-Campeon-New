-- Pollos Campeón · 003 RPCs. Prices always come from menu_items; status changes only through set_order_status.

alter table public.menu_items add column excluded_stores text[] not null default '{}'; -- e.g. lasaña de pollo not at Ventura; day combos not at Luján

create or replace function private.status_rank(s public.order_status) returns int language sql immutable set search_path = '' as $$
  select case s when 'new' then 0 when 'confirmed' then 1 when 'preparing' then 2 when 'cooking' then 3 when 'ready' then 4
    when 'out_for_delivery' then 5 when 'delivered' then 6 when 'cancelled' then 7 end $$;

create or replace function private.new_code() returns text language plpgsql volatile set search_path = '' as $$
declare a text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := 'PC-';
    for i in 1..5 loop c := c || substr(a, 1 + floor(random() * length(a))::int, 1); end loop;
    exit when not exists (select 1 from public.orders where code = c);
  end loop;
  return c;
end $$;

create or replace function public.place_order(payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  tz constant text := 'America/La_Paz';
  v_staff public.staff; v_public boolean; v_existing public.orders; v_store public.stores;
  v_channel public.order_channel; v_service public.service_type; v_phone text; v_name text;
  v_sched timestamptz; v_sched_raw text; v_day date; v_dow int; v_now_local timestamp := (now() at time zone tz);
  v_cust uuid; v_sub numeric(10,2) := 0; v_order public.orders; v_no int; v_code text;
  it jsonb; v_item public.menu_items; v_qty int; v_lines jsonb := '[]'; v_avail boolean; n_lines int;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'bad_payload'; end if;
  if coalesce(payload->>'client_ref','') = '' or length(payload->>'client_ref') > 120 then raise exception 'missing_client_ref'; end if;

  -- 1. idempotency
  select * into v_existing from public.orders where client_ref = payload->>'client_ref';
  if found then
    return jsonb_build_object('ok', true, 'duplicate', true, 'code', v_existing.code, 'order_no', v_existing.order_no, 'tracking_token', v_existing.tracking_token,
      'subtotal', v_existing.subtotal, 'delivery_fee', v_existing.delivery_fee, 'total', v_existing.total, 'status', v_existing.status, 'store', v_existing.store_id,
      'store_whatsapp', (select whatsapp from public.stores where id = v_existing.store_id),
      'items', (select jsonb_agg(jsonb_build_object('id', item_id, 'name', name, 'qty', qty, 'unit_price', unit_price, 'line_total', line_total)) from public.order_items where order_id = v_existing.id));
  end if;

  -- 2. caller
  select * into v_staff from public.staff where user_id = (select auth.uid()) and active;
  v_public := v_staff.user_id is null;
  begin v_channel := coalesce(payload->>'channel', 'web')::public.order_channel; exception when others then raise exception 'bad_channel'; end;
  if v_public and v_channel not in ('web','campeia') then raise exception 'bad_channel'; end if;
  begin v_service := coalesce(payload->>'service', 'pickup')::public.service_type; exception when others then raise exception 'bad_service'; end;

  -- 3. store
  select * into v_store from public.stores where (id = payload->>'store' or lower(name) = lower(payload->>'store')) and active;
  if not found then raise exception 'unknown_store'; end if;
  if not v_public and v_staff.role not in ('owner','admin') and v_staff.store_id <> v_store.id then raise exception 'not_your_store'; end if;
  if v_public then
    if v_store.is_paused and (v_store.paused_until is null or v_store.paused_until > now()) then raise exception 'store_paused'; end if;
    if v_service = 'delivery' and not v_store.accepts_delivery then raise exception 'delivery_unavailable'; end if;
    if v_service = 'pickup' and not v_store.accepts_pickup then raise exception 'pickup_unavailable'; end if;
    if v_service = 'dine_in' then raise exception 'bad_service'; end if;
  end if;

  -- 4. customer data
  v_phone := public.normalize_phone(payload->>'customer_phone');
  if v_public and v_phone is null then raise exception 'invalid_phone'; end if;
  v_name := nullif(btrim(left(payload->>'customer_name', 80)), '');
  if v_public and v_name is null then raise exception 'missing_name'; end if;
  if v_service = 'delivery' and coalesce(btrim(payload->>'address'),'') = '' and (payload->>'lat') is null then raise exception 'missing_address'; end if;

  -- 5. schedule
  v_sched_raw := nullif(payload->>'scheduled_for', '');
  if v_sched_raw ~ '^\d{1,2}:\d{2}$' then
    v_sched := ((v_now_local::date + v_sched_raw::time) at time zone tz);
  elsif v_sched_raw is not null then
    begin v_sched := v_sched_raw::timestamptz; exception when others then raise exception 'bad_schedule'; end;
  end if;
  v_day := coalesce((v_sched at time zone tz)::date, v_now_local::date);
  v_dow := extract(dow from v_day)::int;

  -- 6. anti-abuse
  if v_public and v_phone is not null then
    if (select count(*) from public.orders where customer_phone = v_phone and channel in ('web','campeia') and created_at > now() - interval '10 minutes') >= 5 then raise exception 'rate_limited'; end if;
    if exists (select 1 from public.customers where phone = v_phone and blocked) then raise exception 'customer_blocked'; end if;
  end if;

  -- 7. items, priced from menu_items
  if jsonb_typeof(payload->'items') <> 'array' then raise exception 'no_items'; end if;
  n_lines := jsonb_array_length(payload->'items');
  if n_lines < 1 or n_lines > 30 then raise exception 'no_items'; end if;
  for it in select * from jsonb_array_elements(payload->'items') loop
    select * into v_item from public.menu_items where id = it->>'id' and active;
    if not found then raise exception 'unknown_item:%', coalesce(it->>'id','?'); end if;
    select available into v_avail from public.store_item_availability where store_id = v_store.id and item_id = v_item.id;
    if v_avail = false then raise exception 'sold_out:%', v_item.name; end if;
    if v_store.id = any(v_item.excluded_stores) then raise exception 'item_not_at_store'; end if;
    if v_item.available_days is not null and not (v_dow = any(v_item.available_days)) then raise exception 'promo_not_today'; end if;
    if v_item.valid_until is not null and v_day > v_item.valid_until then raise exception 'promo_not_today'; end if;
    v_qty := least(50, greatest(1, coalesce((it->>'qty')::int, 1)));
    v_lines := v_lines || jsonb_build_object('id', v_item.id, 'name', v_item.name, 'qty', v_qty, 'unit_price', v_item.price, 'line_total', v_item.price * v_qty);
    v_sub := v_sub + v_item.price * v_qty;
  end loop;

  -- 8. customer + address
  if v_phone is not null then
    insert into public.customers (phone, name, preferred_store) values (v_phone, v_name, v_store.id)
      on conflict (phone) do update set name = coalesce(excluded.name, public.customers.name), preferred_store = excluded.preferred_store
      returning id into v_cust;
    if nullif(payload->>'invoice_nit','') is not null then
      update public.customers set nit_ci = payload->>'invoice_nit', razon_social = coalesce(payload->>'invoice_name', razon_social) where id = v_cust;
    end if;
    if v_service = 'delivery' and coalesce(btrim(payload->>'address'),'') <> '' then
      insert into public.customer_addresses (customer_id, address, reference, lat, lng) values (v_cust, left(payload->>'address', 240), left(payload->>'reference', 240), (payload->>'lat')::float8, (payload->>'lng')::float8)
        on conflict (customer_id, address) do update set last_used_at = now(), reference = coalesce(excluded.reference, public.customer_addresses.reference), lat = coalesce(excluded.lat, public.customer_addresses.lat), lng = coalesce(excluded.lng, public.customer_addresses.lng);
    end if;
  end if;

  -- 9-10. number + insert
  insert into public.store_daily_counters (store_id, day, last_no) values (v_store.id, v_now_local::date, 1)
    on conflict (store_id, day) do update set last_no = public.store_daily_counters.last_no + 1 returning last_no into v_no;
  v_code := private.new_code();
  insert into public.orders (code, client_ref, store_id, customer_id, channel, service, scheduled_for, customer_name, customer_phone, address, reference, lat, lng, notes,
      subtotal, delivery_fee, created_by, order_no, business_day, possible_duplicate, invoice_nit, invoice_name)
    values (v_code, payload->>'client_ref', v_store.id, v_cust, v_channel, v_service, v_sched, v_name, coalesce(v_phone, nullif(payload->>'customer_phone','')),
      left(payload->>'address', 240), left(payload->>'reference', 240), (payload->>'lat')::float8, (payload->>'lng')::float8, left(payload->>'notes', 500),
      v_sub, case when v_service = 'delivery' then coalesce(v_store.delivery_fee, 0) else 0 end, (select auth.uid()), v_no, v_now_local::date,
      v_phone is not null and exists (select 1 from public.orders where customer_phone = v_phone and store_id = v_store.id and subtotal = v_sub and created_at > now() - interval '3 minutes'),
      nullif(payload->>'invoice_nit',''), nullif(payload->>'invoice_name',''))
    returning * into v_order;
  insert into public.order_items (order_id, item_id, name, unit_price, qty, line_total)
    select v_order.id, l->>'id', l->>'name', (l->>'unit_price')::numeric, (l->>'qty')::int, (l->>'line_total')::numeric from jsonb_array_elements(v_lines) l;
  insert into public.order_events (order_id, status, note, actor) values (v_order.id, 'new', 'Pedido recibido (' || v_channel || ')', (select auth.uid()));

  return jsonb_build_object('ok', true, 'code', v_order.code, 'order_no', v_order.order_no, 'tracking_token', v_order.tracking_token, 'subtotal', v_order.subtotal,
    'delivery_fee', v_order.delivery_fee, 'total', v_order.total, 'status', v_order.status, 'store', v_store.id, 'store_whatsapp', v_store.whatsapp, 'items', v_lines);
end $$;

create or replace function public.track_order(token uuid) returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('ok', true, 'code', o.code, 'order_no', o.order_no, 'status', o.status, 'service', o.service,
    'first_name', split_part(coalesce(o.customer_name,''), ' ', 1), 'created_at', o.created_at, 'scheduled_for', o.scheduled_for,
    'total', o.total, 'delivery_fee', o.delivery_fee, 'cancel_reason', (select label from public.cancel_reasons where code = o.cancel_reason),
    'store', jsonb_build_object('name', s.name, 'whatsapp', s.whatsapp, 'prep_minutes', s.prep_minutes),
    'items', (select jsonb_agg(jsonb_build_object('name', i.name, 'qty', i.qty) order by i.id) from public.order_items i where i.order_id = o.id),
    'events', (select jsonb_agg(jsonb_build_object('status', e.status, 'at', e.created_at) order by e.created_at) from public.order_events e where e.order_id = o.id))
  from public.orders o join public.stores s on s.id = o.store_id where o.tracking_token = token $$;

create or replace function public.set_order_status(p_order uuid, p_status public.order_status, p_note text default null, p_cancel_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_staff public.staff; o public.orders; mgr boolean; cr public.cancel_reasons;
begin
  select * into v_staff from public.staff where user_id = (select auth.uid()) and active;
  if not found then raise exception 'not_staff'; end if;
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'not_found'; end if;
  if v_staff.role not in ('owner','admin') and v_staff.store_id <> o.store_id then raise exception 'not_your_store'; end if;
  mgr := v_staff.role in ('owner','admin','manager');
  if o.status = p_status then return jsonb_build_object('ok', true, 'status', o.status); end if;
  if o.status in ('delivered','cancelled') and not mgr then raise exception 'closed_needs_manager'; end if;
  if v_staff.role = 'kitchen' and p_status not in ('confirmed','preparing','cooking','ready') then raise exception 'role_not_allowed'; end if;
  if v_staff.role = 'rider' and p_status not in ('out_for_delivery','delivered') then raise exception 'role_not_allowed'; end if;
  if p_status = 'out_for_delivery' and o.service <> 'delivery' then raise exception 'not_delivery'; end if;
  if p_status = 'cancelled' then
    select * into cr from public.cancel_reasons where code = p_cancel_reason;
    if not found then raise exception 'cancel_reason_required'; end if;
    if cr.needs_note and coalesce(btrim(p_note),'') = '' then raise exception 'cancel_note_required'; end if;
    if private.status_rank(o.status) >= private.status_rank('preparing') and not mgr then raise exception 'cancel_needs_manager'; end if;
  elsif private.status_rank(p_status) < private.status_rank(o.status) and o.status not in ('delivered','cancelled') and not mgr then
    raise exception 'recall_needs_manager';
  end if;
  update public.orders set status = p_status,
    cancel_reason = case when p_status = 'cancelled' then p_cancel_reason else cancel_reason end,
    confirmed_at = case when p_status = 'confirmed' then coalesce(confirmed_at, now()) else confirmed_at end,
    started_at = case when p_status = 'preparing' then coalesce(started_at, now()) else started_at end,
    cooking_at = case when p_status = 'cooking' then coalesce(cooking_at, now()) else cooking_at end,
    ready_at = case when p_status = 'ready' then coalesce(ready_at, now()) else ready_at end,
    dispatched_at = case when p_status = 'out_for_delivery' then coalesce(dispatched_at, now()) else dispatched_at end,
    delivered_at = case when p_status = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
    cancelled_at = case when p_status = 'cancelled' then coalesce(cancelled_at, now()) else cancelled_at end,
    rider_id = case when v_staff.role = 'rider' then v_staff.user_id else rider_id end
  where id = o.id;
  insert into public.order_events (order_id, status, note, actor) values (o.id, p_status, left(p_note, 300), v_staff.user_id);
  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

-- ---------- staff admin ----------
create or replace function public.admin_create_staff(p_email text, p_password text, p_full_name text, p_role public.staff_role, p_store text default null, p_phone text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare me public.staff; uid uuid := gen_random_uuid(); em text := lower(btrim(p_email));
begin
  select * into me from public.staff where user_id = (select auth.uid()) and active and role in ('owner','admin');
  if not found then raise exception 'not_admin'; end if;
  if p_role = 'owner' and me.role <> 'owner' then raise exception 'owner_only'; end if;
  if length(coalesce(p_password,'')) < 8 then raise exception 'weak_password'; end if;
  if em !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'bad_email'; end if;
  if exists (select 1 from auth.users where email = em) then raise exception 'email_taken'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em, extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_full_name), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em, 'email_verified', true), 'email', now(), now(), now());
  insert into public.staff (user_id, full_name, email, phone, role, store_id) values (uid, p_full_name, em, p_phone, p_role, p_store);
  return uid;
end $$;

create or replace function public.admin_update_staff(p_user uuid, p_role public.staff_role, p_store text, p_active boolean, p_full_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare me public.staff; target public.staff;
begin
  select * into me from public.staff where user_id = (select auth.uid()) and active and role in ('owner','admin');
  if not found then raise exception 'not_admin'; end if;
  select * into target from public.staff where user_id = p_user;
  if not found then raise exception 'not_found'; end if;
  if (target.role = 'owner' or p_role = 'owner') and me.role <> 'owner' then raise exception 'owner_only'; end if;
  if p_user = me.user_id and (not p_active or p_role <> me.role) then raise exception 'cant_demote_self'; end if;
  update public.staff set role = p_role, store_id = case when p_role in ('owner','admin') then p_store else coalesce(p_store, store_id) end,
    active = p_active, full_name = coalesce(p_full_name, full_name) where user_id = p_user;
end $$;

create or replace function public.admin_set_password(p_user uuid, p_password text) returns void language plpgsql security definer set search_path = '' as $$
declare me public.staff; target public.staff;
begin
  select * into me from public.staff where user_id = (select auth.uid()) and active and role in ('owner','admin');
  if not found then raise exception 'not_admin'; end if;
  select * into target from public.staff where user_id = p_user;
  if target.role = 'owner' and me.role <> 'owner' then raise exception 'owner_only'; end if;
  if length(coalesce(p_password,'')) < 8 then raise exception 'weak_password'; end if;
  update auth.users set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')), updated_at = now() where id = p_user;
end $$;

-- ---------- reports ----------
create or replace function public.report_summary(p_from date, p_to date, p_store text default null) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare me public.staff; v_store text := p_store; tz constant text := 'America/La_Paz'; r jsonb;
begin
  select * into me from public.staff where user_id = (select auth.uid()) and active;
  if not found then raise exception 'not_staff'; end if;
  if me.role not in ('owner','admin') then v_store := me.store_id; end if;
  with o as (select * from public.orders where business_day between p_from and p_to and (v_store is null or store_id = v_store)),
       ok as (select * from o where status <> 'cancelled')
  select jsonb_build_object(
    'orders', (select count(*) from o),
    'revenue', (select coalesce(sum(total),0) from ok),
    'avg_ticket', (select coalesce(round(avg(total),2),0) from ok),
    'cancelled', (select count(*) from o where status = 'cancelled'),
    'cancelled_pct', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where status = 'cancelled') / count(*), 1) end from o),
    'customers', (select count(distinct customer_id) from ok),
    'new_customers', (select count(*) from public.customers c where (c.first_order_at at time zone tz)::date between p_from and p_to and exists (select 1 from ok where ok.customer_id = c.id)),
    'avg_prep_min', (select round(avg(extract(epoch from ready_at - confirmed_at) / 60)::numeric, 1) from ok where ready_at is not null and confirmed_at is not null),
    'avg_out_min', (select round(avg(extract(epoch from dispatched_at - created_at) / 60)::numeric, 1) from ok where dispatched_at is not null),
    'avg_delivery_min', (select round(avg(extract(epoch from delivered_at - created_at) / 60)::numeric, 1) from ok where delivered_at is not null and service = 'delivery'),
    'late_pct', (select case when count(*) = 0 then 0 else round(100.0 * count(*) filter (where delivered_at - created_at > interval '45 minutes') / count(*), 1) end from ok where delivered_at is not null),
    'by_day', (select coalesce(jsonb_agg(x order by x->>'day'), '[]') from (select jsonb_build_object('day', business_day, 'orders', count(*), 'revenue', sum(total)) x from ok group by business_day) t),
    'by_hour', (select coalesce(jsonb_agg(x order by (x->>'hour')::int), '[]') from (select jsonb_build_object('hour', h, 'orders', count(*)) x from (select extract(hour from created_at at time zone tz)::int h from ok) hh group by h) t),
    'by_store', (select coalesce(jsonb_agg(x), '[]') from (select jsonb_build_object('store', store_id, 'orders', count(*), 'revenue', sum(total)) x from ok group by store_id) t),
    'by_channel', (select coalesce(jsonb_agg(x), '[]') from (select jsonb_build_object('channel', channel, 'orders', count(*), 'revenue', sum(total)) x from ok group by channel) t),
    'by_service', (select coalesce(jsonb_agg(x), '[]') from (select jsonb_build_object('service', service, 'orders', count(*), 'revenue', sum(total)) x from ok group by service) t),
    'top_items', (select coalesce(jsonb_agg(x), '[]') from (select jsonb_build_object('item', i.name, 'qty', sum(i.qty), 'revenue', sum(i.line_total)) x from public.order_items i join ok on ok.id = i.order_id group by i.name order by sum(i.qty) desc limit 15) t),
    'cancel_reasons', (select coalesce(jsonb_agg(x), '[]') from (select jsonb_build_object('reason', reason, 'count', count(*)) x from (select coalesce(cr.label, o.cancel_reason, '?') reason from o left join public.cancel_reasons cr on cr.code = o.cancel_reason where o.status = 'cancelled') rr group by reason) t)
  ) into r;
  return r;
end $$;

-- ---------- grants ----------
revoke execute on all functions in schema public from anon, public;
grant execute on function public.place_order(jsonb), public.track_order(uuid), public.normalize_phone(text) to anon, authenticated;
grant execute on function public.set_order_status(uuid, public.order_status, text, text), public.admin_create_staff(text, text, text, public.staff_role, text, text),
  public.admin_update_staff(uuid, public.staff_role, text, boolean, text), public.admin_set_password(uuid, text), public.report_summary(date, date, text) to authenticated;
