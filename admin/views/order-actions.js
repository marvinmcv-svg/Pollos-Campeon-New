// Order detail drawer: timeline, customer, maps, payment, rider, notes, recall, cancel, WhatsApp, tracking link.
import { sb, state, esc, money, dt, hhmm, statusPill, drawer, toast, errMsg, is, waLink, phoneFmt, PAYMENTS, SERVICES, CHANNELS, STATUS, CFG } from "../lib.js";

export async function openOrder(id, onChange) {
  const { data: o, error } = await sb.from("orders").select("*, order_items(*), order_events(*)").eq("id", id).single();
  if (error) return toast(errMsg(error), true);
  const mgr = is("owner", "admin", "manager");
  const { data: riders } = await sb.from("staff").select("user_id, full_name, role, store_id").eq("role", "rider").eq("active", true);
  const track = `${CFG.siteUrl || location.origin}${CFG.trackPath || "/sigue-tu-pollo/"}?t=${o.tracking_token}`;
  const ev = (o.order_events || []).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const editable = is("owner", "admin", "manager", "cashier");
  const { box, close } = drawer(`Pedido #${o.order_no} · ${o.code}`, `
    <p>${statusPill(o.status)} <span class="pill">${esc(SERVICES[o.service])}</span> <span class="pill">${esc(CHANNELS[o.channel])}</span> ${o.possible_duplicate ? `<span class="dup">⚠ posible duplicado</span>` : ""}</p>
    <div class="card"><b>${esc(o.customer_name || "Sin nombre")}</b> · ${esc(phoneFmt(o.customer_phone))}<br/>
      ${o.address ? `${esc(o.address)}${o.reference ? ` (Ref: ${esc(o.reference)})` : ""}<br/>` : ""}
      ${o.lat ? `<a href="https://maps.google.com/?q=${o.lat},${o.lng}" target="_blank" rel="noopener">📍 Ver en el mapa</a><br/>` : ""}
      ${o.scheduled_for ? `<b>Programado: ${dt(o.scheduled_for)}</b><br/>` : ""}${o.notes ? `<i>${esc(o.notes)}</i>` : ""}</div>
    <table class="table">${o.order_items.map((i) => `<tr><td>${i.qty} ×</td><td>${esc(i.name)}</td><td>${money(i.line_total)}</td></tr>`).join("")}
      <tr><td></td><td>Subtotal</td><td>${money(o.subtotal)}</td></tr><tr><td></td><td>Delivery</td><td>${money(o.delivery_fee)}</td></tr><tr><td></td><td>Descuento</td><td>−${money(o.discount)}</td></tr><tr><th></th><th>Total</th><th>${money(o.total)}</th></tr></table>
    ${editable ? `<h3 style="margin:16px 0 8px;font-size:1rem">Pago y entrega</h3>
    <div class="grid2"><label class="field"><span>Medio de pago</span><select class="input" id="pm"><option value="">—</option>${Object.entries(PAYMENTS).map(([k, v]) => `<option value="${k}" ${o.payment_method === k ? "selected" : ""}>${v}</option>`).join("")}</select></label>
      <label class="field"><span>Estado del pago</span><select class="input" id="ps">${["pending", "paid", "refunded"].map((k) => `<option value="${k}" ${o.payment_status === k ? "selected" : ""}>${{ pending: "Pendiente", paid: "Pagado", refunded: "Devuelto" }[k]}</option>`).join("")}</select></label>
      <label class="field"><span>Costo de delivery</span><input class="input" id="df" type="number" min="0" step="0.5" value="${o.delivery_fee}" /></label>
      <label class="field"><span>Descuento</span><input class="input" id="dc" type="number" min="0" step="0.5" value="${o.discount}" ${mgr ? "" : "disabled"} /></label>
      ${o.service === "delivery" ? `<label class="field"><span>Repartidor</span><select class="input" id="rd"><option value="">—</option>${(riders || []).filter((r) => !r.store_id || r.store_id === o.store_id).map((r) => `<option value="${r.user_id}" ${o.rider_id === r.user_id ? "selected" : ""}>${esc(r.full_name)}</option>`).join("")}</select></label>` : ""}
      <label class="field"><span>Notas</span><input class="input" id="nt" value="${esc(o.notes || "")}" /></label></div>
    <button class="btn btn--dark" id="save">Guardar cambios</button>` : ""}
    <h3 style="margin:18px 0 8px;font-size:1rem">Historial</h3>
    <ul class="timeline">${ev.map((e) => `<li><b>${esc(STATUS[e.status])}</b> · ${hhmm(e.created_at)}${e.note ? ` — ${esc(e.note)}` : ""}</li>`).join("")}</ul>
    <div class="row" style="margin-top:16px">
      ${o.customer_phone ? `<a class="btn btn--wa" target="_blank" rel="noopener" href="${esc(waLink(o.customer_phone, `Hola ${(o.customer_name || "").split(" ")[0]}, te escribimos de Pollos Campeón por tu pedido ${o.code}.`))}">WhatsApp al cliente</a>` : ""}
      <button class="btn btn--ghost" id="copy">Copiar link de seguimiento</button>
      ${mgr && !["new", "cancelled"].includes(o.status) ? `<select class="input" id="recall" style="width:auto"><option value="">Volver a…</option>${["new", "confirmed", "preparing", "cooking", "ready"].map((s) => `<option value="${s}">${STATUS[s]}</option>`).join("")}</select>` : ""}
      ${o.status !== "cancelled" && !is("kitchen", "rider") ? `<button class="btn btn--danger" id="cancel">Cancelar pedido</button>` : ""}
    </div>
    <div id="cbox"></div>`);
  const q = (s) => box.querySelector(s);
  const done = () => { close(); onChange && onChange(); };
  q("#copy").addEventListener("click", () => navigator.clipboard.writeText(track).then(() => toast("Link copiado")));
  if (q("#save")) q("#save").addEventListener("click", async () => {
    const patch = { payment_method: q("#pm").value || null, payment_status: q("#ps").value, delivery_fee: +q("#df").value || 0, notes: q("#nt").value || null };
    if (mgr) patch.discount = +q("#dc").value || 0;
    if (q("#rd")) patch.rider_id = q("#rd").value || null;
    const { error: e } = await sb.from("orders").update(patch).eq("id", o.id);
    if (e) toast(errMsg(e), true); else { toast("Guardado"); done(); }
  });
  if (q("#recall")) q("#recall").addEventListener("change", async (e) => {
    if (!e.target.value) return;
    const { error: er } = await sb.rpc("set_order_status", { p_order: o.id, p_status: e.target.value, p_note: "Vuelto atrás" });
    if (er) toast(errMsg(er), true); else { toast("Estado actualizado"); done(); }
  });
  if (q("#cancel")) q("#cancel").addEventListener("click", () => {
    q("#cbox").innerHTML = `<div class="card" style="margin-top:12px"><label class="field"><span>Motivo</span><select class="input" id="cr">${state.reasons.map((r) => `<option value="${r.code}">${esc(r.label)}</option>`).join("")}</select></label>
      <label class="field"><span>Nota</span><input class="input" id="cn" /></label><button class="btn btn--danger" id="cgo">Confirmar cancelación</button></div>`;
    q("#cgo").addEventListener("click", async () => {
      const { error: er } = await sb.rpc("set_order_status", { p_order: o.id, p_status: "cancelled", p_note: q("#cn").value || null, p_cancel_reason: q("#cr").value });
      if (er) toast(errMsg(er), true); else { toast("Pedido cancelado"); done(); }
    });
  });
}
