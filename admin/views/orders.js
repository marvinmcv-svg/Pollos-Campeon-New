// Live kanban board per store. Realtime + refetch on reconnect/visibility + 60 s safety poll.
import { sb, state, $, $$, esc, money, hhmm, minsAgo, statusPill, nextStep, isAdmin, storeSelect, beep, toast, errMsg, CHANNELS, SERVICES, STATUS } from "../lib.js";
import { openOrder } from "./order-actions.js";

const COLS = ["new", "confirmed", "preparing", "cooking", "ready", "out_for_delivery"];
export async function render(el) {
  let store = isAdmin() ? (state.storeFilter || "") : state.staff.store_id;
  let orders = [], seen = new Set(), first = true;
  el.innerHTML = `<div class="vhead"><h1>Pedidos</h1><div class="row">${isAdmin() ? storeSelect("ostore", { value: store }) : ""}<label class="row"><input type="checkbox" id="showdone" /> Entregados hoy</label></div></div><div class="board" id="board"></div>`;
  if (isAdmin()) $("#ostore", el).addEventListener("change", (e) => { store = e.target.value; state.storeFilter = store; load(); });
  $("#showdone", el).addEventListener("change", draw);

  async function load() {
    let q = sb.from("orders").select("*, order_items(name, qty)").gte("created_at", new Date(Date.now() - 36 * 3600e3).toISOString()).order("created_at", { ascending: true }).limit(400);
    if (store) q = q.eq("store_id", store);
    const { data, error } = await q;
    if (error) return toast(errMsg(error), true);
    const fresh = (data || []).filter((o) => o.status === "new" && !seen.has(o.id));
    if (!first && fresh.length) { beep(); notify(fresh.length); }
    (data || []).forEach((o) => seen.add(o.id));
    orders = data || []; first = false; draw(fresh.map((o) => o.id));
  }
  function notify(n) {
    if (document.hidden && "Notification" in window && Notification.permission === "granted") new Notification("Pollos Campeón", { body: `${n} pedido(s) nuevo(s)`, icon: "/assets/brand/icon-192.png" });
  }
  function draw(highlight = []) {
    const done = $("#showdone", el).checked;
    const cols = done ? [...COLS, "delivered"] : COLS;
    const newCount = orders.filter((o) => o.status === "new").length;
    const b = document.getElementById("nbadge"); if (b) { b.hidden = !newCount; b.textContent = newCount; }
    document.title = newCount ? `(${newCount}) Pedidos · Campeón` : "Pedidos · Campeón Admin";
    $("#board", el).innerHTML = cols.map((c) => {
      const list = orders.filter((o) => o.status === c && (c !== "delivered" || o.business_day === orders[orders.length - 1]?.business_day));
      return `<section class="col"><h2>${esc(STATUS[c])}<span>${list.length}</span></h2>${list.map((o) => card(o, highlight.includes(o.id))).join("") || `<p class="empty">—</p>`}</section>`;
    }).join("");
  }
  function card(o, hl) {
    const age = minsAgo(o.created_at), cls = ["delivered"].includes(o.status) ? "" : age >= 20 ? "age-red" : age >= 10 ? "age-amber" : "";
    const nx = nextStep(o);
    const canNext = nx && allowedNext(nx[0]);
    return `<article class="ocard ${cls} ${hl ? "is-new" : ""}" data-id="${o.id}">
      <div class="ocard__top"><span class="ocard__no">#${esc(o.order_no)}</span><span class="ocard__age">${age} min</span></div>
      <small>${esc(o.code)} · ${hhmm(o.created_at)}${o.scheduled_for ? ` · <b>para ${hhmm(o.scheduled_for)}</b>` : ""}</small>
      <div class="ocard__meta"><span class="pill">${esc(SERVICES[o.service])}</span><span class="pill">${esc(CHANNELS[o.channel] || o.channel)}</span>${!store ? `<span class="pill">${esc((state.stores.find((s) => s.id === o.store_id) || {}).name)}</span>` : ""}</div>
      ${o.possible_duplicate ? `<div class="dup">⚠ posible duplicado</div>` : ""}
      <ul>${(o.order_items || []).map((i) => `<li>${esc(i.qty)} × ${esc(i.name)}</li>`).join("")}</ul>
      <b>${money(o.total)}</b> · ${esc(o.customer_name || "")}
      ${canNext ? `<button class="btn btn--primary btn--big" data-next="${nx[0]}">${esc(nx[1])}</button>` : ""}</article>`;
  }
  function allowedNext(s) {
    const r = state.staff.role;
    if (r === "kitchen") return ["confirmed", "preparing", "cooking", "ready"].includes(s);
    if (r === "rider") return ["out_for_delivery", "delivered"].includes(s);
    return true;
  }
  el.addEventListener("click", async (e) => {
    const nb = e.target.closest("[data-next]");
    const c = e.target.closest(".ocard");
    if (nb && c) {
      e.stopPropagation(); nb.disabled = true;
      const { error } = await sb.rpc("set_order_status", { p_order: c.dataset.id, p_status: nb.dataset.next });
      if (error) { toast(errMsg(error), true); nb.disabled = false; } else load();
      return;
    }
    if (c) openOrder(c.dataset.id, load);
  });

  const ch = sb.channel(`orders-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "orders", ...(store ? { filter: `store_id=eq.${store}` } : {}) }, () => load())
    .subscribe((s) => { if (s === "SUBSCRIBED") load(); });
  const vis = () => { if (!document.hidden) load(); };
  document.addEventListener("visibilitychange", vis);
  window.addEventListener("online", load);
  const poll = setInterval(load, 60000), tick = setInterval(() => draw(), 30000);
  if ("Notification" in window && Notification.permission === "default") el.insertAdjacentHTML("afterbegin", `<p class="card row" id="np">Activá las notificaciones para no perder pedidos. <button class="btn btn--sm btn--dark" id="npb">Activar</button></p>`);
  const npb = $("#npb", el); if (npb) npb.addEventListener("click", () => Notification.requestPermission().then(() => $("#np", el).remove()));
  await load();
  return () => { sb.removeChannel(ch); clearInterval(poll); clearInterval(tick); document.removeEventListener("visibilitychange", vis); window.removeEventListener("online", load); document.title = "Campeón Admin"; };
}
