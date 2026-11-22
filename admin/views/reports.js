// Reports: date range + store, KPI tiles vs targets, SVG charts, top items, cancel reasons, CSV.
import { sb, state, $, esc, money, storeSelect, toast, errMsg, csv, today, isAdmin, CHANNELS, SERVICES } from "../lib.js";

export async function render(el) {
  const t = today(), from = new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
  el.innerHTML = `<div class="vhead"><h1>Reportes</h1><div class="row"><input class="input" type="date" id="f" value="${from}" style="width:auto" /><input class="input" type="date" id="t" value="${t}" style="width:auto" />
    ${isAdmin() ? storeSelect("s") : ""}<button class="btn btn--dark" id="go">Ver</button><button class="btn btn--ghost" id="exp">CSV de pedidos</button></div></div><div id="out"><div class="loading">Cargando…</div></div>`;
  const q = (s) => $(s, el);
  const tile = (label, val, cls) => `<div class="kpi ${cls || ""}"><small>${esc(label)}</small><b>${val}</b></div>`;
  const grade = (v, good, warn) => v == null ? "" : v <= good ? "kpi--ok" : v <= warn ? "kpi--warn" : "kpi--bad";
  function barChart(rows, key, val, fmt = (x) => x) {
    const max = Math.max(1, ...rows.map((r) => +r[val]));
    return `<div class="bars">${rows.map((r) => `<div><span>${esc(fmt(r[key]))}</span><i style="width:${(100 * r[val]) / max}%"></i><b>${esc(val === "revenue" ? money(r[val]) : r[val])}</b></div>`).join("") || `<p class="empty">Sin datos.</p>`}</div>`;
  }
  function lineChart(rows) {
    if (!rows.length) return `<p class="empty">Sin datos.</p>`;
    const W = 640, H = 180, P = 28, max = Math.max(1, ...rows.map((r) => +r.revenue));
    const x = (i) => P + (rows.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (rows.length - 1)), y = (v) => H - P - (v / max) * (H - 2 * P);
    const pts = rows.map((r, i) => `${x(i)},${y(+r.revenue)}`).join(" ");
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ventas por día"><polyline fill="none" stroke="#e00217" stroke-width="3" points="${pts}"/>${rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(+r.revenue)}" r="4" fill="#e00217"><title>${r.day}: ${money(r.revenue)}</title></circle><text x="${x(i)}" y="${H - 8}" text-anchor="middle">${String(r.day).slice(5)}</text>`).join("")}</svg>`;
  }
  async function load() {
    const { data: r, error } = await sb.rpc("report_summary", { p_from: q("#f").value, p_to: q("#t").value, p_store: isAdmin() ? q("#s").value || null : null });
    if (error) return toast(errMsg(error), true);
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: `${h}h`, orders: (r.by_hour.find((x) => x.hour === h) || {}).orders || 0 })).filter((h, i, a) => h.orders || a.slice(i).some((x) => x.orders) && a.slice(0, i + 1).some((x) => x.orders));
    q("#out").innerHTML = `<div class="kpis">${tile("Pedidos", r.orders)}${tile("Ventas", money(r.revenue))}${tile("Ticket promedio", money(r.avg_ticket))}${tile("Clientes", `${r.customers} <small style="display:inline;font-size:.7rem">(${r.new_customers} nuevos)</small>`)}
      ${tile("Preparación (meta ≤ 15)", r.avg_prep_min == null ? "—" : `${r.avg_prep_min} min`, grade(r.avg_prep_min, 15, 20))}${tile("Salida (meta ≤ 20)", r.avg_out_min == null ? "—" : `${r.avg_out_min} min`, grade(r.avg_out_min, 20, 28))}
      ${tile("Entrega (meta ≤ 40)", r.avg_delivery_min == null ? "—" : `${r.avg_delivery_min} min`, grade(r.avg_delivery_min, 40, 50))}${tile("Cancelados (meta < 3%)", `${r.cancelled_pct}%`, grade(r.cancelled_pct, 2.99, 6))}${tile("Tarde > 45 min (meta < 20%)", `${r.late_pct}%`, grade(r.late_pct, 19.99, 30))}</div>
      <div class="card" style="margin-bottom:12px"><h2 style="font-size:1rem;margin-bottom:8px">Ventas por día</h2>${lineChart(r.by_day)}</div>
      <div class="grid2"><div class="card"><h2 style="font-size:1rem;margin-bottom:8px">Pedidos por hora</h2>${barChart(hours, "hour", "orders")}</div>
        <div class="card"><h2 style="font-size:1rem;margin-bottom:8px">Por sucursal</h2>${barChart(r.by_store, "store", "revenue", (s) => (state.stores.find((x) => x.id === s) || {}).name || s)}</div>
        <div class="card"><h2 style="font-size:1rem;margin-bottom:8px">Por canal</h2>${barChart(r.by_channel, "channel", "orders", (c) => CHANNELS[c] || c)}</div>
        <div class="card"><h2 style="font-size:1rem;margin-bottom:8px">Por servicio</h2>${barChart(r.by_service, "service", "orders", (c) => SERVICES[c] || c)}</div>
        <div class="card"><h2 style="font-size:1rem;margin-bottom:8px">Más vendidos</h2>${barChart(r.top_items, "item", "qty")}</div>
        <div class="card"><h2 style="font-size:1rem;margin-bottom:8px">Motivos de cancelación</h2>${barChart(r.cancel_reasons, "reason", "count")}</div></div>`;
  }
  q("#go").addEventListener("click", load);
  q("#exp").addEventListener("click", async () => {
    let qq = sb.from("orders").select("code, order_no, business_day, store_id, channel, service, status, customer_name, customer_phone, subtotal, delivery_fee, discount, total, payment_method, payment_status, cancel_reason, created_at").gte("business_day", q("#f").value).lte("business_day", q("#t").value).order("created_at").limit(10000);
    if (isAdmin() && q("#s").value) qq = qq.eq("store_id", q("#s").value);
    const { data, error } = await qq; if (error) return toast(errMsg(error), true);
    csv(`pedidos-${q("#f").value}-${q("#t").value}.csv`, data);
  });
  await load();
}
