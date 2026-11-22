// Campeón Admin · auth, role-based navigation, hash router with lazy views.
import { sb, state, configured, $, esc, ROLES, errMsg, toast, closeLayer } from "./lib.js";

const ROUTES = [
  { path: "hoy", label: "Hoy", view: "home", roles: ["owner", "admin", "manager"] },
  { path: "pedidos", label: "Pedidos", view: "orders", roles: ["owner", "admin", "manager", "cashier", "kitchen", "rider"], badge: true },
  { path: "nuevo", label: "Nuevo pedido", view: "neworder", roles: ["owner", "admin", "manager", "cashier"] },
  { path: "clientes", label: "Clientes", view: "customers", roles: ["owner", "admin", "manager", "cashier"] },
  { path: "sucursales", label: "Sucursales", view: "stores", roles: ["owner", "admin", "manager"] },
  { path: "agotados", label: "Agotados", view: "availability", roles: ["owner", "admin", "manager", "cashier", "kitchen"] },
  { path: "menu", label: "Menú", view: "menu", roles: ["owner", "admin"] },
  { path: "reportes", label: "Reportes", view: "reports", roles: ["owner", "admin", "manager", "cashier"] },
  { path: "equipo", label: "Equipo", view: "team", roles: ["owner", "admin"] },
  { path: "auditoria", label: "Auditoría", view: "audit", roles: ["owner", "admin"] },
  { path: "cuenta", label: "Mi cuenta", view: "account", roles: ["owner", "admin", "manager", "cashier", "kitchen", "rider"] },
];
let cleanup = null;

async function boot() {
  if (!configured) { $("#noconfig").hidden = false; return; }
  const { data } = await sb.auth.getSession();
  if (!data.session) return showLogin();
  await enter();
}
function showLogin() { $("#app").hidden = true; $("#login").hidden = false; setTimeout(() => $("#lemail").focus(), 30); }
$("#loginform").addEventListener("submit", async (e) => {
  e.preventDefault(); $("#lerr").textContent = "";
  const btn = e.submitter; btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email: $("#lemail").value.trim(), password: $("#lpass").value });
  btn.disabled = false;
  if (error) { $("#lerr").textContent = errMsg(error); return; }
  await enter();
});

async function enter() {
  const { data: u } = await sb.auth.getUser();
  const { data: staff } = await sb.from("staff").select("*").eq("user_id", u.user.id).maybeSingle();
  if (!staff || !staff.active) { await sb.auth.signOut(); showLogin(); $("#lerr").textContent = "Tu usuario no tiene acceso. Pedíselo al dueño."; return; }
  state.staff = staff;
  const [st, mn, cr] = await Promise.all([sb.from("stores").select("*").order("sort"), sb.from("menu_items").select("*").order("sort"), sb.from("cancel_reasons").select("*").order("sort")]);
  state.stores = st.data || []; state.menu = mn.data || []; state.reasons = cr.data || [];
  $("#login").hidden = true; $("#app").hidden = false;
  $("#me").innerHTML = `<b>${esc(staff.full_name)}</b>${esc(ROLES[staff.role])}${staff.store_id ? ` · ${esc((state.stores.find((s) => s.id === staff.store_id) || {}).name || "")}` : ""}<br/><a href="#" id="logout" style="color:var(--mustard)">Salir</a>`;
  $("#logout").addEventListener("click", async (e) => { e.preventDefault(); await sb.auth.signOut(); location.hash = ""; location.reload(); });
  $("#nav").innerHTML = allowed().map((r) => `<a href="#/${r.path}" data-path="${r.path}">${esc(r.label)}${r.badge ? `<span class="nbadge" id="nbadge" hidden>0</span>` : ""}</a>`).join("");
  route();
}
const allowed = () => ROUTES.filter((r) => r.roles.includes(state.staff.role));
window.addEventListener("hashchange", () => state.staff && route());
async function route() {
  closeLayer();
  const path = (location.hash.match(/^#\/([\w-]+)/) || [])[1];
  const r = allowed().find((x) => x.path === path) || allowed()[0];
  if (r.path !== path) { history.replaceState(null, "", `#/${r.path}`); }
  document.querySelectorAll("#nav a").forEach((a) => { if (a.dataset.path === r.path) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (cleanup) { try { cleanup(); } catch { /* */ } cleanup = null; }
  const old = $("#view"), el = old.cloneNode(false); old.replaceWith(el); // fresh element: no stale listeners
  el.innerHTML = `<div class="loading">Cargando…</div>`;
  try {
    const mod = await import(`./views/${r.view}.js`);
    cleanup = (await mod.render(el)) || null;
  } catch (e) { console.error(e); el.innerHTML = `<div class="card">No se pudo cargar esta sección. ${esc(errMsg(e))}</div>`; }
  el.focus({ preventScroll: true });
}
sb && sb.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") showLogin(); });
boot().catch((e) => toast(errMsg(e), true));
