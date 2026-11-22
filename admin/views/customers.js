// CRM with segments, search, filters, sort, CSV export and an editable profile.
import { sb, state, $, esc, money, dt, phoneFmt, drawer, toast, errMsg, csv, statusPill, waLink } from "../lib.js";

const SEG = { vip: "VIP", frequent: "Frecuente", at_risk: "En riesgo", new: "Nuevo", occasional: "Ocasional", lost: "Perdido", none: "Sin pedidos" };
export async function render(el) {
  const { data, error } = await sb.from("customers").select("*").order("last_order_at", { ascending: false, nullsFirst: false }).limit(5000);
  if (error) { el.innerHTML = `<div class="card">${esc(errMsg(error))}</div>`; return; }
  const all = data || [];
  const spends = all.map((c) => +c.total_spent).sort((a, b) => b - a);
  const vipCut = Math.max(500, spends[Math.floor(spends.length * 0.1)] || 0); // top 10% or ≥ Bs 500
  const days = (d) => (d ? (Date.now() - new Date(d)) / 864e5 : Infinity);
  const seg = (c) => { const n = c.orders_count, d = days(c.last_order_at);
    if (!n) return "none"; if (+c.total_spent >= vipCut) return "vip"; if (n >= 3 && d < 30) return "frequent"; if (n >= 2 && d >= 30 && d <= 60) return "at_risk"; if (d > 60) return "lost"; if (n === 1) return "new"; return "occasional"; };
  all.forEach((c) => (c._seg = seg(c)));
  const tags = [...new Set(all.flatMap((c) => c.tags || []))];
  el.innerHTML = `<div class="vhead"><h1>Clientes</h1><button class="btn btn--dark" id="exp">Exportar CSV</button></div>
    <div class="tabsx" id="segs"><button aria-pressed="true" data-s="">Todos (${all.length})</button>${Object.entries(SEG).map(([k, v]) => `<button aria-pressed="false" data-s="${k}">${v} (${all.filter((c) => c._seg === k).length})</button>`).join("")}</div>
    <div class="row" style="margin-bottom:12px"><input class="input grow" id="q" placeholder="Buscar nombre o teléfono" style="max-width:320px" />
      <select class="input" id="tag" style="width:auto"><option value="">Etiqueta</option>${tags.map((t) => `<option>${esc(t)}</option>`).join("")}</select>
      <select class="input" id="pst" style="width:auto"><option value="">Sucursal preferida</option>${state.stores.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join("")}</select>
      <label class="row"><input type="checkbox" id="opt" /> Acepta marketing</label>
      <select class="input" id="sort" style="width:auto"><option value="last">Último pedido</option><option value="spent">Más gasto</option><option value="orders">Más pedidos</option><option value="name">Nombre</option></select></div>
    <div class="card tablewrap"><table class="table" id="tbl"></table></div>`;
  let segF = "";
  const q = (s) => $(s, el);
  function rows() {
    const t = q("#q").value.toLowerCase().trim(), tg = q("#tag").value, ps = q("#pst").value, op = q("#opt").checked, so = q("#sort").value;
    let r = all.filter((c) => (!segF || c._seg === segF) && (!t || (c.name || "").toLowerCase().includes(t) || c.phone.includes(t.replace(/\D/g, "") || "§")) && (!tg || (c.tags || []).includes(tg)) && (!ps || c.preferred_store === ps) && (!op || c.marketing_opt_in));
    const cmp = { last: (a, b) => (b.last_order_at || "").localeCompare(a.last_order_at || ""), spent: (a, b) => b.total_spent - a.total_spent, orders: (a, b) => b.orders_count - a.orders_count, name: (a, b) => (a.name || "").localeCompare(b.name || "") }[so];
    return r.sort(cmp);
  }
  function draw() {
    const r = rows();
    q("#tbl").innerHTML = `<tr><th>Cliente</th><th>Teléfono</th><th>Segmento</th><th>Pedidos</th><th>Gastado</th><th>Último</th></tr>` + r.slice(0, 500).map((c) => `<tr class="click" data-id="${c.id}"><td>${esc(c.name || "—")}</td><td>${esc(phoneFmt(c.phone))}</td><td><span class="pill">${SEG[c._seg]}</span></td><td>${c.orders_count}</td><td>${money(c.total_spent)}</td><td>${dt(c.last_order_at)}</td></tr>`).join("") + (r.length ? "" : `<tr><td class="empty" colspan="6">Sin resultados.</td></tr>`);
  }
  q("#segs").addEventListener("click", (e) => { const b = e.target.closest("[data-s]"); if (!b) return; segF = b.dataset.s; q("#segs").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); draw(); });
  ["#q", "#tag", "#pst", "#opt", "#sort"].forEach((s) => q(s).addEventListener("input", draw));
  q("#exp").addEventListener("click", () => csv("clientes-campeon.csv", rows().map((c) => ({ nombre: c.name, telefono: c.phone, segmento: SEG[c._seg], pedidos: c.orders_count, gastado: c.total_spent, ultimo_pedido: c.last_order_at, sucursal: c.preferred_store, marketing: c.marketing_opt_in, etiquetas: (c.tags || []).join(" ") }))));
  el.addEventListener("click", (e) => { const r = e.target.closest("tr[data-id]"); if (r) profile(all.find((c) => c.id === r.dataset.id)); });
  async function profile(c) {
    const [{ data: orders }, { data: addrs }] = await Promise.all([sb.from("orders").select("id, code, created_at, status, total, order_items(name, qty)").eq("customer_id", c.id).order("created_at", { ascending: false }).limit(30), sb.from("customer_addresses").select("*").eq("customer_id", c.id)]);
    const fav = {}; (orders || []).forEach((o) => o.order_items.forEach((i) => (fav[i.name] = (fav[i.name] || 0) + i.qty)));
    const { box, close } = drawer(c.name || phoneFmt(c.phone), `
      <div class="kpis"><div class="kpi"><small>Pedidos</small><b>${c.orders_count}</b></div><div class="kpi"><small>Gastado</small><b>${money(c.total_spent)}</b></div><div class="kpi"><small>Segmento</small><b style="font-size:1.1rem">${SEG[c._seg]}</b></div></div>
      <p><a class="btn btn--wa btn--sm" target="_blank" rel="noopener" href="${esc(waLink(c.phone))}">WhatsApp ${esc(phoneFmt(c.phone))}</a></p>
      <p><b>Favoritos:</b> ${Object.entries(fav).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, q]) => `${esc(n)} (${q})`).join(", ") || "—"}</p>
      <p><b>Direcciones:</b><br/>${(addrs || []).map((a) => `${esc(a.address)}${a.reference ? ` (${esc(a.reference)})` : ""}`).join("<br/>") || "—"}</p>
      <div class="grid2"><label class="field"><span>Nombre</span><input class="input" id="pn" value="${esc(c.name || "")}" /></label><label class="field"><span>Cumpleaños</span><input class="input" type="date" id="pb" value="${esc(c.birthday || "")}" /></label>
        <label class="field"><span>NIT / CI</span><input class="input" id="pnit" value="${esc(c.nit_ci || "")}" /></label><label class="field"><span>Razón social</span><input class="input" id="prs" value="${esc(c.razon_social || "")}" /></label></div>
      <label class="field"><span>Etiquetas (separadas por coma)</span><input class="input" id="pt" value="${esc((c.tags || []).join(", "))}" /></label>
      <label class="field"><span>Alergias</span><input class="input" id="pa" value="${esc(c.allergies || "")}" /></label>
      <label class="field"><span>Notas</span><textarea class="input" id="pno" rows="2">${esc(c.notes || "")}</textarea></label>
      <div class="row"><label class="row"><input type="checkbox" id="po" ${c.marketing_opt_in ? "checked" : ""} /> Acepta marketing</label><label class="row"><input type="checkbox" id="pbl" ${c.blocked ? "checked" : ""} /> Bloqueado</label></div>
      <button class="btn btn--dark" id="psave" style="margin:10px 0 18px">Guardar</button>
      <h3 style="font-size:1rem">Historial</h3><table class="table">${(orders || []).map((o) => `<tr><td>${esc(o.code)}</td><td>${dt(o.created_at)}</td><td>${statusPill(o.status)}</td><td>${money(o.total)}</td></tr>`).join("")}</table>`);
    const g = (s) => box.querySelector(s);
    g("#psave").addEventListener("click", async () => {
      const opt = g("#po").checked;
      const patch = { name: g("#pn").value || null, birthday: g("#pb").value || null, nit_ci: g("#pnit").value || null, razon_social: g("#prs").value || null, tags: g("#pt").value.split(",").map((s) => s.trim()).filter(Boolean),
        allergies: g("#pa").value || null, notes: g("#pno").value || null, marketing_opt_in: opt, blocked: g("#pbl").checked, ...(opt && !c.marketing_opt_in ? { opt_in_at: new Date().toISOString(), opt_in_source: "admin" } : {}) };
      const { error: e } = await sb.from("customers").update(patch).eq("id", c.id);
      if (e) return toast(errMsg(e), true);
      Object.assign(c, patch); toast("Cliente actualizado"); close(); draw();
    });
  }
  draw();
}
