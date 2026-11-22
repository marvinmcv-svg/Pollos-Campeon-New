// Live API checks against the real Supabase project. Creates test orders and cancels them afterwards.
// Usage: SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… OWNER_EMAIL=… MANAGER_EMAIL=… KITCHEN_EMAIL=… \
//        node tests/backend.e2e.js <ownerPw> <managerPw> <kitchenPw>
// The manager and kitchen users must belong to the same store (MANAGER store), e.g. created from /admin → Equipo.
const assert = require("node:assert/strict");
const URL_ = (process.env.SUPABASE_URL || "").replace(/\/$/, ""), KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const [ownerPw, mgrPw, kitPw] = process.argv.slice(2);
if (!URL_ || !KEY || !kitPw) { console.error("Missing env/args. See header."); process.exit(2); }
const H = (jwt) => ({ apikey: KEY, "Content-Type": "application/json", ...(jwt ? { Authorization: `Bearer ${jwt}` } : /^eyJ/.test(KEY) ? { Authorization: `Bearer ${KEY}` } : {}) });
async function req(path, { method = "GET", body, jwt } = {}) {
  const r = await fetch(`${URL_}${path}`, { method, headers: H(jwt), body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; }
  return { status: r.status, data: d };
}
const rpc = (fn, args, jwt) => req(`/rest/v1/rpc/${fn}`, { method: "POST", body: args, jwt });
async function login(email, password) { const r = await req("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } }); assert.equal(r.status, 200, `login ${email}`); return r.data.access_token; }
const err = (r) => String((r.data && (r.data.message || r.data.error)) || r.data);
let pass = 0; const ok = (m) => { pass++; console.log("✓", m); };

(async () => {
  const owner = await login(process.env.OWNER_EMAIL, ownerPw), mgr = await login(process.env.MANAGER_EMAIL, mgrPw), kit = await login(process.env.KITCHEN_EMAIL, kitPw);
  const me = await req(`/rest/v1/staff?select=store_id&email=eq.${encodeURIComponent(process.env.MANAGER_EMAIL)}`, { jwt: owner });
  const store = me.data[0].store_id;
  const ref = `e2e-${Date.now()}`;
  const base = { channel: "web", store, service: "pickup", customer_name: "Prueba E2E", customer_phone: "79999999", items: [{ id: "pierna-brasa", qty: 2, price: 1, unit_price: 1 }] };

  assert.equal((await req("/rest/v1/orders?select=id&limit=1")).status >= 400 || (await req("/rest/v1/orders?select=id&limit=1")).data.length === 0, true); ok("publishable key can't read orders");
  const cust = await req("/rest/v1/customers?select=id&limit=1"); assert.ok(cust.status >= 400 || cust.data.length === 0); ok("publishable key can't read customers");
  const p1 = await rpc("place_order", { payload: { ...base, client_ref: ref } }); assert.equal(p1.status, 200, err(p1)); assert.equal(Number(p1.data.total), 74); ok("place_order priced from the menu (client price ignored)");
  const p2 = await rpc("place_order", { payload: { ...base, client_ref: ref } }); assert.equal(p2.data.code, p1.data.code); assert.equal(p2.data.duplicate, true); ok("idempotent client_ref");
  const tr = await rpc("track_order", { token: p1.data.tracking_token }); assert.equal(tr.data.status, "new"); assert.ok(!("customer_phone" in tr.data)); ok("track_order: status, no phone/address");

  await req(`/rest/v1/store_item_availability`, { method: "POST", jwt: owner, body: { store_id: store, item_id: "papas", available: false } });
  const so = await rpc("place_order", { payload: { ...base, client_ref: ref + "-so", items: [{ id: "papas" }] } }); assert.match(err(so), /sold_out/); ok("sold out rejected");
  await req(`/rest/v1/store_item_availability?store_id=eq.${store}&item_id=eq.papas`, { method: "DELETE", jwt: owner });
  await req(`/rest/v1/stores?id=eq.${store}`, { method: "PATCH", jwt: owner, body: { is_paused: true } });
  const pa = await rpc("place_order", { payload: { ...base, client_ref: ref + "-pa" } }); assert.match(err(pa), /store_paused/); ok("paused store rejected");
  await req(`/rest/v1/stores?id=eq.${store}`, { method: "PATCH", jwt: owner, body: { is_paused: false } });

  const { data: [o] } = await req(`/rest/v1/orders?select=id&code=eq.${p1.data.code}`, { jwt: mgr });
  assert.equal((await rpc("set_order_status", { p_order: o.id, p_status: "confirmed" }, kit)).status, 200); ok("kitchen confirms");
  await rpc("set_order_status", { p_order: o.id, p_status: "preparing" }, kit);
  assert.match(err(await rpc("set_order_status", { p_order: o.id, p_status: "delivered" }, kit)), /role_not_allowed/); ok("kitchen can't deliver");
  assert.match(err(await rpc("set_order_status", { p_order: o.id, p_status: "cancelled", p_cancel_reason: "sold_out" }, kit)), /role_not_allowed/); ok("kitchen can't cancel");
  const direct = await req(`/rest/v1/orders?id=eq.${o.id}`, { method: "PATCH", jwt: mgr, body: { status: "delivered", total: 1 } }); assert.ok(direct.status >= 400); ok("status/total can't be patched directly");
  const other = await req(`/rest/v1/orders?select=store_id&store_id=neq.${store}&limit=5`, { jwt: mgr }); assert.equal(other.data.length, 0); ok("manager sees only own store");
  assert.equal((await rpc("set_order_status", { p_order: o.id, p_status: "cancelled", p_note: "e2e", p_cancel_reason: "other" }, mgr)).status, 200); ok("manager cancels with reason");
  const au = await req(`/rest/v1/audit_log?select=id&entity=eq.orders&entity_id=eq.${o.id}`, { jwt: owner }); assert.ok(au.data.length >= 1); ok("audit row written");
  console.log(`\n${pass} checks passed. Test order ${p1.data.code} was cancelled.`);
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
