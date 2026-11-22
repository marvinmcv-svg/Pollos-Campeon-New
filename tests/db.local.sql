-- Local DB checks (plain Postgres + tests/supabase-stub.sql). Run: see README "Tests".
\set ON_ERROR_STOP 1
create or replace function pg_temp.expect_error(sql text, needle text) returns void language plpgsql as $$
begin
  begin execute sql; exception when others then
    if position(needle in sqlerrm) > 0 then return; end if;
    raise exception 'expected error containing "%", got "%"', needle, sqlerrm;
  end;
  raise exception 'expected error "%" but statement succeeded: %', needle, sql;
end $$;
grant execute on function pg_temp.expect_error(text, text) to anon, authenticated;

-- owner bootstrap (as superuser, like the dashboard)
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000001', 'owner@test.bo');
insert into public.staff (user_id, full_name, email, role) values ('00000000-0000-4000-8000-000000000001', 'Dueño', 'owner@test.bo', 'owner');

-- ===== anon =====
set role anon; select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_error('select * from public.orders', 'permission denied');
select pg_temp.expect_error('select * from public.customers', 'permission denied');
select pg_temp.expect_error('update public.menu_items set price = 1', 'permission denied');
do $$ declare r jsonb; r2 jsonb; t jsonb; begin
  r := public.place_order('{"client_ref":"t-1","channel":"web","store":"norte","service":"pickup","customer_name":"Ana Pérez","customer_phone":"712-34567","items":[{"id":"pierna-brasa","qty":2,"price":1},{"id":"papas","qty":1}]}');
  assert (r->>'ok')::boolean and (r->>'total')::numeric = 86, 'priced from menu_items: ' || r::text;
  assert r->>'code' ~ '^PC-[A-Z2-9]{5}$';
  r2 := public.place_order('{"client_ref":"t-1","channel":"web","store":"norte","service":"pickup","customer_name":"Ana","customer_phone":"71234567","items":[{"id":"aji","qty":1}]}');
  assert (r2->>'duplicate')::boolean and r2->>'code' = r->>'code', 'idempotent';
  t := public.track_order((r->>'tracking_token')::uuid);
  assert t->>'first_name' = 'Ana' and t->>'status' = 'new' and not (t ? 'customer_phone') and not (t ? 'address'), 'track: ' || t::text;
end $$;
select pg_temp.expect_error($$select public.place_order('{"client_ref":"t-2","channel":"phone","store":"norte","service":"pickup","customer_name":"A","customer_phone":"71234567","items":[{"id":"papas"}]}')$$, 'bad_channel');
select pg_temp.expect_error($$select public.place_order('{"client_ref":"t-3","channel":"web","store":"norte","service":"pickup","customer_name":"A","customer_phone":"123","items":[{"id":"papas"}]}')$$, 'invalid_phone');
select pg_temp.expect_error($$select public.place_order('{"client_ref":"t-4","channel":"web","store":"norte","service":"delivery","customer_name":"A","customer_phone":"71234567","items":[{"id":"papas"}]}')$$, 'missing_address');
select pg_temp.expect_error($$select public.place_order('{"client_ref":"t-5","channel":"web","store":"norte","service":"pickup","customer_name":"A","customer_phone":"71234567","items":[{"id":"hack"}]}')$$, 'unknown_item:hack');
select pg_temp.expect_error($$select public.place_order('{"client_ref":"t-6","channel":"web","store":"ventura","service":"pickup","customer_name":"A","customer_phone":"71234567","items":[{"id":"lasana-pollo"}]}')$$, 'item_not_at_store');
select pg_temp.expect_error($$select public.place_order('{"client_ref":"t-7","channel":"web","store":"norte","service":"pickup","customer_name":"A","customer_phone":"71234567","items":[{"id":"combo-dupla"}]}')$$, 'unknown_item');
select pg_temp.expect_error($$select public.place_order('{"client_ref":"t-11","channel":"web","store":"norte","service":"pickup","customer_name":"A","customer_phone":"71234567","scheduled_for":"2026-11-23T20:00:00Z","items":[{"id":"combo-champion"}]}')$$, 'promo_not_today');
select pg_temp.expect_error($$select public.place_order('{"client_ref":"t-12","channel":"web","store":"norte","service":"pickup","customer_name":"A","customer_phone":"71234567","scheduled_for":"2026-12-03T20:00:00Z","items":[{"id":"combo-champion"}]}')$$, 'promo_not_today');
select pg_temp.expect_error($$select public.place_order('{"client_ref":"t-13","channel":"web","store":"lujan","service":"pickup","customer_name":"A","customer_phone":"71234567","scheduled_for":"2026-11-26T20:00:00Z","items":[{"id":"combo-champion"}]}')$$, 'item_not_at_store');
select (public.place_order('{"client_ref":"t-14","channel":"web","store":"norte","service":"pickup","customer_name":"A","customer_phone":"71234567","scheduled_for":"2026-11-26T20:00:00Z","items":[{"id":"combo-champion"}]}')->>'total')::numeric = 70 as champion_ok_on_thursday;
reset role;

-- ===== owner creates staff =====
set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false);
select public.admin_create_staff('mgr.norte@test.bo', 'clave-segura-1', 'Gerente Norte', 'manager', 'norte') is not null;
select public.admin_create_staff('cocina@test.bo', 'clave-segura-2', 'Cocina Norte', 'kitchen', 'norte') is not null;
select public.admin_create_staff('caja@test.bo', 'clave-segura-3', 'Caja Norte', 'cashier', 'norte') is not null;
select public.admin_create_staff('mgr.sur@test.bo', 'clave-segura-4', 'Gerente Sur', 'manager', 'sur') is not null;
select pg_temp.expect_error($$select public.admin_create_staff('x@test.bo', 'corta', 'X', 'cashier', 'sur')$$, 'weak_password');
select pg_temp.expect_error($$select public.admin_update_staff('00000000-0000-4000-8000-000000000001', 'admin', null, true)$$, 'cant_demote_self');
update public.menu_items set price = 38 where id = 'pierna-brasa';
update public.menu_items set price = 37 where id = 'pierna-brasa';
-- staff can't change status or prices directly
select pg_temp.expect_error($$update public.orders set status = 'delivered'$$, 'permission denied');
select pg_temp.expect_error($$update public.orders set total = 1$$, 'permission denied');
reset role;

-- sold out + paused
insert into public.store_item_availability (store_id, item_id, available) values ('norte', 'papas', false);
update public.stores set is_paused = true where id = 'sur';
set role anon; select set_config('request.jwt.claim.sub', '', false);
select pg_temp.expect_error($$select public.place_order('{"client_ref":"t-8","channel":"web","store":"norte","service":"pickup","customer_name":"A","customer_phone":"71234567","items":[{"id":"papas"}]}')$$, 'sold_out:Papas fritas');
select pg_temp.expect_error($$select public.place_order('{"client_ref":"t-9","channel":"web","store":"sur","service":"pickup","customer_name":"A","customer_phone":"71234567","items":[{"id":"aji"}]}')$$, 'store_paused');
select public.place_order('{"client_ref":"t-10","channel":"campeia","store":"norte","service":"delivery","address":"Calle 1","lat":-17.78,"lng":-63.18,"customer_name":"Beto","customer_phone":"76543210","items":[{"id":"pecho-brasa"}]}') ->> 'ok';
reset role;
update public.stores set is_paused = false where id = 'sur';

-- ===== role limits =====
do $$ declare o uuid; o2 uuid; k uuid; c uuid; m uuid; ms uuid; n int; begin
  select id into o from public.orders where client_ref = 't-1';
  select id into o2 from public.orders where client_ref = 't-10';
  select user_id into k from public.staff where email = 'cocina@test.bo';
  select user_id into c from public.staff where email = 'caja@test.bo';
  select user_id into m from public.staff where email = 'mgr.norte@test.bo';
  select user_id into ms from public.staff where email = 'mgr.sur@test.bo';
  perform set_config('request.jwt.claim.sub', k::text, false); set local role authenticated;
  perform public.set_order_status(o, 'confirmed'); perform public.set_order_status(o, 'preparing');
  begin perform public.set_order_status(o2, 'out_for_delivery'); raise exception 'kitchen dispatched!'; exception when others then assert sqlerrm = 'role_not_allowed', sqlerrm; end;
  begin perform public.set_order_status(o, 'cancelled', null, 'sold_out'); raise exception 'kitchen cancelled!'; exception when others then assert sqlerrm = 'role_not_allowed', sqlerrm; end;
  reset role;
  perform set_config('request.jwt.claim.sub', c::text, false); set local role authenticated;
  begin perform public.set_order_status(o, 'cancelled', null, 'changed_mind'); raise exception 'cashier cancelled!'; exception when others then assert sqlerrm = 'cancel_needs_manager', sqlerrm; end;
  begin perform public.set_order_status(o, 'confirmed'); raise exception 'cashier recalled!'; exception when others then assert sqlerrm = 'recall_needs_manager', sqlerrm; end;
  reset role;
  perform set_config('request.jwt.claim.sub', ms::text, false); set local role authenticated;
  select count(*) into n from public.orders; assert n = 0, 'manager sur sees norte orders: ' || n;
  begin perform public.set_order_status(o, 'ready'); raise exception 'other store!'; exception when others then assert sqlerrm = 'not_your_store', sqlerrm; end;
  reset role;
  perform set_config('request.jwt.claim.sub', m::text, false); set local role authenticated;
  select count(*) into n from public.orders; assert n = 3, 'manager norte sees ' || n;
  begin perform public.set_order_status(o, 'cancelled', null, 'other'); raise exception 'no note!'; exception when others then assert sqlerrm = 'cancel_note_required', sqlerrm; end;
  perform public.set_order_status(o, 'cancelled', 'cliente llamó', 'changed_mind');
  begin perform public.set_order_status(o, 'out_for_delivery'); raise exception 'pickup dispatched!'; exception when others then assert sqlerrm = 'not_delivery', sqlerrm; end;
  update public.orders set payment_method = 'cash', discount = 0 where id = o2;
  perform public.report_summary(current_date - 1, current_date + 1);
  reset role;
  assert (select count(*) from public.order_events where order_id = o) = 4, 'events';
  assert (select cancelled_at is not null and confirmed_at is not null from public.orders where id = o), 'timestamps';
  assert (select count(*) from public.audit_log where entity = 'menu_items' and action = 'update') = 2, 'price audit';
  assert (select count(*) from public.audit_log where entity = 'orders' and data->'after'->>'status' = 'cancelled') = 1, 'status audit';
  assert (select orders_count from public.customers where phone = '+59171234567') = 1, 'cancelled excluded from stats';
  assert (select orders_count from public.customers where phone = '+59176543210') = 1, 'customer stats';
end $$;
\echo ALL DB CHECKS PASSED
