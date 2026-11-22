-- Pollos Campeón · 002 operations, helpers, triggers, row-level security.

-- ---------- operational columns ----------
alter table public.stores
  add column paused_until timestamptz,
  add column accepts_delivery boolean not null default true,
  add column accepts_pickup boolean not null default true,
  add column prep_minutes int not null default 20 check (prep_minutes between 1 and 240);

alter table public.customers
  add column alt_phone text,
  add column nit_ci text,                    -- NIT / CI for the factura
  add column razon_social text,
  add column allergies text,
  add column blocked boolean not null default false,
  add column opt_in_at timestamptz,
  add column opt_in_source text;

alter table public.customer_addresses
  add column zona text,                      -- barrio / zona
  add column anillo text;                    -- Santa Cruz ring road (1er … 8vo anillo)

alter table public.orders
  add column tracking_token uuid not null unique default gen_random_uuid(),
  add column order_no int,
  add column business_day date,
  add column possible_duplicate boolean not null default false,
  add column invoice_nit text,
  add column invoice_name text,
  add column courier text not null default 'own',   -- 'own' | delivery app name
  add column courier_ref text,
  add column courier_cost numeric(10,2),
  add column started_at timestamptz,
  add column cooking_at timestamptz;
create index orders_day_store on public.orders (business_day, store_id);

create table public.store_daily_counters (
  store_id text not null references public.stores(id) on delete cascade,
  day date not null,
  last_no int not null default 0,
  primary key (store_id, day)
);

create table public.cancel_reasons (
  code text primary key,
  label text not null,
  needs_note boolean not null default false,
  sort int not null default 0
);
insert into public.cancel_reasons (code, label, needs_note, sort) values
  ('changed_mind','El cliente cambió de opinión',false,1),
  ('no_answer','El cliente no responde',false,2),
  ('duplicate','Pedido duplicado',false,3),
  ('fake','Pedido falso / broma',false,4),
  ('out_of_zone','Fuera de la zona de delivery',false,5),
  ('sold_out','Producto agotado',false,6),
  ('store_busy','Sucursal cerrada o saturada',false,7),
  ('delay','Demora excesiva',false,8),
  ('taking_error','Error al tomar el pedido',false,9),
  ('payment','Pago no confirmado',false,10),
  ('wrong_address','Dirección incorrecta',false,11),
  ('absent','Cliente ausente en la entrega',false,12),
  ('courier','Problema con el repartidor / app',false,13),
  ('other','Otro',true,99);

-- ---------- private helpers ----------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, anon;

create or replace function private.my_staff() returns public.staff language sql stable security definer set search_path = '' as $$
  select s.* from public.staff s where s.user_id = (select auth.uid()) and s.active limit 1 $$;
create or replace function private.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.active and s.role in ('owner','admin')) $$;
create or replace function private.is_staff() returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.active) $$;
create or replace function private.can_store(p_store text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.active and (s.role in ('owner','admin') or s.store_id = p_store)) $$;
create or replace function private.has_role(p_roles public.staff_role[]) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff s where s.user_id = (select auth.uid()) and s.active and s.role = any(p_roles)) $$;
grant execute on all functions in schema private to authenticated, anon;

create or replace function public.normalize_phone(p text) returns text language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p,''), '\D', '', 'g');
begin
  if length(d) = 11 and left(d,3) = '591' then d := substr(d,4); end if;
  if length(d) = 8 and left(d,1) in ('6','7') then return '+591' || d; end if;
  return null;
end $$;

-- ---------- triggers ----------
create or replace function private.order_totals() returns trigger language plpgsql set search_path = '' as $$
begin new.total := greatest(0, coalesce(new.subtotal,0) + coalesce(new.delivery_fee,0) - coalesce(new.discount,0)); return new; end $$;
create trigger t_order_totals before insert or update of subtotal, delivery_fee, discount on public.orders for each row execute function private.order_totals();

create or replace function private.refresh_customer_stats() returns trigger language plpgsql security definer set search_path = '' as $$
declare cid uuid := coalesce(new.customer_id, old.customer_id);
begin
  if cid is null then return null; end if;
  update public.customers c set
    orders_count = x.n, total_spent = x.t, first_order_at = x.f, last_order_at = x.l
  from (select count(*) n, coalesce(sum(total),0) t, min(created_at) f, max(created_at) l
        from public.orders where customer_id = cid and status <> 'cancelled') x
  where c.id = cid;
  return null;
end $$;
create trigger t_customer_stats after insert or update of status, total, customer_id on public.orders for each row execute function private.refresh_customer_stats();

create or replace function private.audit() returns trigger language plpgsql security definer set search_path = '' as $$
declare v_id text; v_data jsonb;
begin
  if tg_op = 'DELETE' then v_id := (to_jsonb(old) ->> case when tg_table_name = 'store_item_availability' then 'item_id' when tg_table_name = 'staff' then 'user_id' else 'id' end);
    v_data := jsonb_build_object('before', to_jsonb(old));
  elsif tg_op = 'INSERT' then v_id := (to_jsonb(new) ->> case when tg_table_name = 'store_item_availability' then 'item_id' when tg_table_name = 'staff' then 'user_id' else 'id' end);
    v_data := jsonb_build_object('after', to_jsonb(new));
  else v_id := (to_jsonb(new) ->> case when tg_table_name = 'store_item_availability' then 'item_id' when tg_table_name = 'staff' then 'user_id' else 'id' end);
    if tg_table_name = 'orders' then
      v_data := jsonb_build_object('before', (select jsonb_object_agg(k, to_jsonb(old) -> k) from unnest(array['status','cancel_reason','discount','delivery_fee','payment_method','payment_status','total','rider_id']) k),
                                   'after',  (select jsonb_object_agg(k, to_jsonb(new) -> k) from unnest(array['status','cancel_reason','discount','delivery_fee','payment_method','payment_status','total','rider_id']) k));
      if v_data -> 'before' = v_data -> 'after' then return null; end if;
    else v_data := jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new)); end if;
  end if;
  if tg_table_name = 'store_item_availability' then v_data := v_data || jsonb_build_object('store_id', coalesce(to_jsonb(new) ->> 'store_id', to_jsonb(old) ->> 'store_id')); end if;
  insert into public.audit_log (actor, action, entity, entity_id, data) values ((select auth.uid()), lower(tg_op), tg_table_name, v_id, v_data);
  return null;
end $$;
create trigger a_stores after insert or update or delete on public.stores for each row execute function private.audit();
create trigger a_menu after insert or update or delete on public.menu_items for each row execute function private.audit();
create trigger a_avail after insert or update or delete on public.store_item_availability for each row execute function private.audit();
create trigger a_staff after insert or update or delete on public.staff for each row execute function private.audit();
create trigger a_orders after update on public.orders for each row execute function private.audit();

-- ---------- row-level security ----------
alter table public.stores enable row level security;
alter table public.menu_items enable row level security;
alter table public.store_item_availability enable row level security;
alter table public.staff enable row level security;
alter table public.customers enable row level security;
alter table public.customer_addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.audit_log enable row level security;
alter table public.store_daily_counters enable row level security;
alter table public.cancel_reasons enable row level security;

-- public catalogue (no personal data)
create policy stores_read on public.stores for select to anon, authenticated using (true);
create policy menu_read on public.menu_items for select to anon, authenticated using (true);
create policy avail_read on public.store_item_availability for select to anon, authenticated using (true);
create policy cancel_read on public.cancel_reasons for select to anon, authenticated using (true);

create policy stores_update on public.stores for update to authenticated
  using ((select private.is_admin()) or ((select private.has_role(array['manager']::public.staff_role[])) and (select private.can_store(id))))
  with check ((select private.is_admin()) or ((select private.has_role(array['manager']::public.staff_role[])) and (select private.can_store(id))));
create policy stores_insert on public.stores for insert to authenticated with check ((select private.is_admin()));

create policy menu_write on public.menu_items for all to authenticated using ((select private.is_admin())) with check ((select private.is_admin()));

create policy avail_write on public.store_item_availability for all to authenticated
  using ((select private.has_role(array['owner','admin','manager','cashier','kitchen']::public.staff_role[])) and (select private.can_store(store_id)))
  with check ((select private.has_role(array['owner','admin','manager','cashier','kitchen']::public.staff_role[])) and (select private.can_store(store_id)));

create policy staff_read on public.staff for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin())
         or ((select private.has_role(array['manager']::public.staff_role[])) and store_id = (select (private.my_staff()).store_id)));

create policy customers_rw on public.customers for all to authenticated
  using ((select private.has_role(array['owner','admin','manager','cashier']::public.staff_role[])))
  with check ((select private.has_role(array['owner','admin','manager','cashier']::public.staff_role[])));
create policy addresses_read on public.customer_addresses for select to authenticated
  using ((select private.has_role(array['owner','admin','manager','cashier','rider']::public.staff_role[])));
create policy addresses_write on public.customer_addresses for all to authenticated
  using ((select private.has_role(array['owner','admin','manager','cashier']::public.staff_role[])))
  with check ((select private.has_role(array['owner','admin','manager','cashier']::public.staff_role[])));

create policy orders_read on public.orders for select to authenticated using ((select private.can_store(store_id)));
create policy orders_update on public.orders for update to authenticated using ((select private.can_store(store_id))) with check ((select private.can_store(store_id)));
create policy items_read on public.order_items for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (select private.can_store(o.store_id))));
create policy events_read on public.order_events for select to authenticated using (exists (select 1 from public.orders o where o.id = order_id and (select private.can_store(o.store_id))));
create policy audit_read on public.audit_log for select to authenticated using ((select private.is_admin()));

-- column-level: anon sees nothing personal; staff may only edit operational order columns.
revoke all on public.customers, public.customer_addresses, public.orders, public.order_items, public.order_events, public.audit_log, public.staff, public.store_daily_counters from anon;
revoke insert, update, delete on public.orders, public.order_items, public.order_events, public.audit_log, public.staff, public.store_daily_counters from authenticated;
revoke insert, update, delete, truncate on public.stores, public.menu_items, public.store_item_availability, public.cancel_reasons from anon;
grant update (payment_method, payment_status, cash_change_for, rider_id, notes, delivery_fee, discount, address, reference, courier, courier_ref, courier_cost, invoice_nit, invoice_name, scheduled_for)
  on public.orders to authenticated;

-- realtime
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.order_events, public.stores, public.store_item_availability;
  end if;
end $$;
