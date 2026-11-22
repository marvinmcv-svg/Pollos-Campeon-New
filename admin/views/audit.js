// Audit log: who changed what and when, readable before → after, filters.
import { sb, state, $, esc, dt, toast, errMsg } from "../lib.js";

const ENT = { stores: "Sucursal", menu_items: "Menú", store_item_availability: "Agotados", staff: "Equipo", orders: "Pedido" };
const ACT = { insert: "creó", update: "cambió", delete: "borró" };
const SKIP = new Set(["updated_at", "created_at"]);
export async function render(el) {
  const { data: staff } = await sb.from("staff").select("user_id, full_name");
  const who = (id) => (staff || []).find((s) => s.user_id === id)?.full_name || (id ? "—" : "Sistema / web");
  el.innerHTML = `<div class="vhead"><h1>Auditoría</h1><div class="row"><select class="input" id="e" style="width:auto"><option value="">Todo</option>${Object.entries(ENT).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select>
    <select class="input" id="w" style="width:auto"><option value="">Cualquier persona</option>${(staff || []).map((s) => `<option value="${s.user_id}">${esc(s.full_name)}</option>`).join("")}</select></div></div><div class="card tablewrap"><table class="table" id="tbl"></table></div>`;
  const fmt = (v) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  function diff(r) {
    const b = (r.data && r.data.before) || {}, a = (r.data && r.data.after) || {};
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !SKIP.has(k) && JSON.stringify(b[k]) !== JSON.stringify(a[k]));
    if (r.action === "insert") return `<span class="diff">${esc(a.name || a.full_name || a.item_id || "")}</span>`;
    return keys.map((k) => `<div class="diff"><b>${esc(k)}</b>: <del>${esc(fmt(b[k]))}</del> → <ins>${esc(fmt(a[k]))}</ins></div>`).join("") || "—";
  }
  async function load() {
    let q = sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(300);
    if ($("#e", el).value) q = q.eq("entity", $("#e", el).value);
    if ($("#w", el).value) q = q.eq("actor", $("#w", el).value);
    const { data, error } = await q; if (error) return toast(errMsg(error), true);
    $("#tbl", el).innerHTML = `<tr><th>Cuándo</th><th>Quién</th><th>Qué</th><th>Cambio</th></tr>` + data.map((r) => `<tr><td>${dt(r.created_at)}</td><td>${esc(who(r.actor))}</td><td>${esc(ACT[r.action] || r.action)} ${esc(ENT[r.entity] || r.entity)} <small class="muted">${esc(r.entity_id || "")}${r.data && r.data.store_id ? ` · ${esc((state.stores.find((s) => s.id === r.data.store_id) || {}).name || "")}` : ""}</small></td><td>${diff(r)}</td></tr>`).join("");
  }
  $("#e", el).addEventListener("change", load); $("#w", el).addEventListener("change", load);
  await load();
}
