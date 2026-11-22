// Fast manual entry (phone / walk-in / WhatsApp / delivery apps) → place_order (server-priced).
import { sb, state, $, $$, esc, money, storeSelect, toast, errMsg, isAdmin, CHANNELS, PAYMENTS } from "../lib.js";

export async function render(el) {
  const cart = {}; let custFound = null;
  const items = state.menu.filter((m) => m.active);
  el.innerHTML = `<div class="vhead"><h1>Nuevo pedido</h1></div>
  <div class="grid2">
    <div class="card">
      <div class="grid2"><label class="field"><span>Teléfono</span><input class="input" id="ph" inputmode="tel" placeholder="7xx-xxxxx" /></label><label class="field"><span>Nombre</span><input class="input" id="nm" /></label></div>
      <p class="muted" id="cinfo"></p>
      <div class="grid2"><label class="field"><span>Canal</span><select class="input" id="chn">${Object.entries(CHANNELS).filter(([k]) => k !== "web" && k !== "campeia").map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
        <label class="field"><span>Servicio</span><select class="input" id="sv"><option value="pickup">Para recoger</option><option value="delivery">Delivery</option><option value="dine_in">En mesa</option></select></label></div>
      <label class="field"><span>Sucursal</span>${storeSelect("st", { all: false, value: state.staff.store_id })}</label>
      <div id="addr" hidden><label class="field"><span>Dirección</span><input class="input" id="ad" /></label><label class="field"><span>Referencia</span><input class="input" id="rf" /></label></div>
      <div class="grid2"><label class="field"><span>Hora (vacío = ya)</span><input class="input" type="time" id="tm" /></label><label class="field"><span>Pago</span><select class="input" id="pm"><option value="">—</option>${Object.entries(PAYMENTS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label></div>
      <label class="field"><span>Nota</span><input class="input" id="nt" /></label>
    </div>
    <div class="card">
      <label class="field"><span>Buscar en el menú</span><input class="input" id="q" placeholder="pierna, combo, papas…" /></label>
      <div id="list" style="max-height:280px;overflow:auto"></div>
      <h3 style="font-size:1rem;margin:14px 0 6px">Pedido</h3><table class="table" id="lines"></table>
      <button class="btn btn--primary btn--block btn--big" id="go">Registrar pedido</button>
    </div>
  </div>`;
  const q = (s) => $(s, el);
  const drawList = () => { const t = q("#q").value.toLowerCase(); q("#list").innerHTML = items.filter((i) => !t || i.name.toLowerCase().includes(t)).map((i) => `<div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(i.name)} <b>${money(i.price)}</b>${i.available_days ? ` <span class="pill">solo ${["dom", "lun", "mar", "mié", "jue", "vie", "sáb"][i.available_days[0]]}</span>` : ""}</span><button class="btn btn--sm btn--dark" data-add="${i.id}">+</button></div>`).join(""); };
  const drawLines = () => { const ids = Object.keys(cart); const tot = ids.reduce((a, id) => a + cart[id] * items.find((i) => i.id === id).price, 0);
    q("#lines").innerHTML = ids.map((id) => { const it = items.find((i) => i.id === id); return `<tr><td>${esc(it.name)}</td><td><button class="btn btn--sm" data-dec="${id}">−</button> ${cart[id]} <button class="btn btn--sm" data-add="${id}">+</button></td><td>${money(it.price * cart[id])}</td></tr>`; }).join("") + `<tr><th colspan="2">Total (el sistema recalcula)</th><th>${money(tot)}</th></tr>`; };
  q("#q").addEventListener("input", drawList);
  el.addEventListener("click", (e) => { const a = e.target.closest("[data-add]"), d = e.target.closest("[data-dec]");
    if (a) { cart[a.dataset.add] = Math.min(50, (cart[a.dataset.add] || 0) + 1); drawLines(); }
    if (d) { cart[d.dataset.dec]--; if (cart[d.dataset.dec] <= 0) delete cart[d.dataset.dec]; drawLines(); } });
  q("#sv").addEventListener("change", () => (q("#addr").hidden = q("#sv").value !== "delivery"));
  q("#ph").addEventListener("change", async () => {
    const { data: norm } = await sb.rpc("normalize_phone", { p: q("#ph").value });
    if (!norm) { q("#cinfo").textContent = "Teléfono no válido (8 dígitos, empieza con 6 o 7)."; return; }
    const { data: c } = await sb.from("customers").select("id, name, orders_count, allergies, blocked, customer_addresses(address, reference, last_used_at)").eq("phone", norm).maybeSingle();
    custFound = c;
    if (!c) { q("#cinfo").textContent = "Cliente nuevo."; return; }
    if (!q("#nm").value) q("#nm").value = c.name || "";
    const last = (c.customer_addresses || []).sort((a, b) => b.last_used_at.localeCompare(a.last_used_at))[0];
    if (last) { q("#ad").value = last.address; q("#rf").value = last.reference || ""; }
    q("#cinfo").innerHTML = `${esc(c.name || "")} · ${c.orders_count} pedidos${c.allergies ? ` · <b>Alergias: ${esc(c.allergies)}</b>` : ""}${c.blocked ? ` · <b style="color:#a30b0b">BLOQUEADO</b>` : ""}`;
  });
  q("#go").addEventListener("click", async (e) => {
    const btn = e.currentTarget; if (!Object.keys(cart).length) return toast("Agregá productos.", true);
    btn.disabled = true;
    const payload = { client_ref: `admin-${crypto.randomUUID()}`, channel: q("#chn").value, store: q("#st").value, service: q("#sv").value, customer_name: q("#nm").value || null, customer_phone: q("#ph").value || null,
      address: q("#ad").value || null, reference: q("#rf").value || null, scheduled_for: q("#tm").value || null, notes: q("#nt").value || null, items: Object.entries(cart).map(([id, qty]) => ({ id, qty })) };
    const { data, error } = await sb.rpc("place_order", { payload });
    btn.disabled = false;
    if (error) return toast(errMsg(error), true);
    if (q("#pm").value) await sb.from("orders").update({ payment_method: q("#pm").value }).eq("code", data.code);
    toast(`Pedido ${data.code} (#${data.order_no}) registrado · ${money(data.total)}`);
    location.hash = "#/pedidos";
  });
  drawList(); drawLines(); void custFound; void isAdmin;
}
