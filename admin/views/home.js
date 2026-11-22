// Today: KPIs, live counts per status, every store's status, latest orders.
import { sb, state, $, esc, money, hhmm, statusPill, today, toast, errMsg, STATUS, isAdmin } from "../lib.js";
import { openOrder } from "./order-actions.js";

export async function render(el) {
  async function load() {
    const day = today();
    let q = sb.from("orders").select("id, code, order_no, status, total, store_id, customer_name, created_at, service").eq("business_day", day).order("created_at", { ascending: false });
    if (!isAdmin()) q = q.eq("store_id", state.staff.store_id);
    const [{ data: orders, error }, { data: stores }] = await Promise.all([q, sb.from("stores").select("*").order("sort")]);
    if (error) return toast(errMsg(error), true);
    const ok = orders.filter((o) => o.status !== "cancelled"), rev = ok.reduce((a, o) => a + +o.total, 0);
    const counts = {}; orders.forEach((o) => (counts[o.status] = (counts[o.status] || 0) + 1));
    const nowMin = (() => { const p = new Intl.DateTimeFormat("en-GB", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).split(":"); return +p[0] * 60 + +p[1]; })();
    const stState = (s) => {
      if (s.is_paused && (!s.paused_until || new Date(s.paused_until) > new Date())) return `<span class="pill s-cancelled">Pausada</span>`;
      if (!s.open_time) return `<span class="pill">Horario sin cargar</span>`;
      const m = (t) => +t.slice(0, 2) * 60 + +t.slice(3, 5), o = m(s.open_time), c = m(s.close_time);
      const open = c > o ? nowMin >= o && nowMin < c : nowMin >= o || nowMin < c;
      return open ? `<span class="pill s-ready">Abierta</span>` : `<span class="pill s-delivered">Cerrada</span>`;
    };
    el.innerHTML = `<div class="vhead"><h1>Hoy</h1><span class="muted">${esc(day)}</span></div>
      <div class="kpis"><div class="kpi"><small>Pedidos</small><b>${orders.length}</b></div><div class="kpi"><small>Ventas</small><b>${money(rev)}</b></div>
        <div class="kpi"><small>Ticket promedio</small><b>${money(ok.length ? rev / ok.length : 0)}</b></div><div class="kpi ${counts.cancelled ? "kpi--warn" : ""}"><small>Cancelados</small><b>${counts.cancelled || 0}</b></div></div>
      <div class="card" style="margin-bottom:16px"><div class="row">${Object.keys(STATUS).map((s) => `${statusPill(s)} <b>${counts[s] || 0}</b>`).join(" &nbsp; ")}</div></div>
      <div class="grid2"><div class="card"><h2 style="font-size:1.1rem;margin-bottom:8px">Sucursales</h2><table class="table">${stores.filter((s) => isAdmin() || s.id === state.staff.store_id).map((s) => `<tr><td>${esc(s.name)}</td><td>${stState(s)}</td></tr>`).join("")}</table></div>
      <div class="card"><h2 style="font-size:1.1rem;margin-bottom:8px">Últimos pedidos</h2><table class="table">${orders.slice(0, 12).map((o) => `<tr class="click" data-id="${o.id}"><td>#${o.order_no}</td><td>${hhmm(o.created_at)}</td><td>${esc(o.customer_name || "")}</td><td>${statusPill(o.status)}</td><td>${money(o.total)}</td></tr>`).join("") || `<tr><td class="empty">Todavía no hay pedidos hoy.</td></tr>`}</table></div></div>`;
  }
  el.addEventListener("click", (e) => { const r = e.target.closest("[data-id]"); if (r) openOrder(r.dataset.id, load); });
  const ch = sb.channel(`home-${Math.random().toString(36).slice(2)}`).on("postgres_changes", { event: "*", schema: "public", table: "orders" }, load).on("postgres_changes", { event: "*", schema: "public", table: "stores" }, load).subscribe();
  await load();
  return () => sb.removeChannel(ch);
}
