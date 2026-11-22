// Campeón Admin · shared client, state, formatters, labels, UI helpers.
// supabase-js 2.45.4 UMD, vendored in admin/vendor/ (no CDN at runtime) → window.supabase
const { createClient } = window.supabase;

export const CFG = window.CAMPEON_CONFIG || {};
export const DATA = window.CAMPEON;
export const configured = !!(CFG.supabaseUrl && CFG.supabaseKey);
export const sb = configured ? createClient(CFG.supabaseUrl, CFG.supabaseKey, { auth: { persistSession: true } }) : null;
export const state = { staff: null, stores: [], menu: [], reasons: [], storeFilter: null };

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const money = (n) => `Bs ${Number(n || 0).toLocaleString("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const TZ = "America/La_Paz";
export const hhmm = (d) => (d ? new Date(d).toLocaleTimeString("es-BO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }) : "");
export const dt = (d) => (d ? new Date(d).toLocaleString("es-BO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ }) : "");
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
export const minsAgo = (d) => Math.max(0, Math.floor((Date.now() - new Date(d)) / 60000));
export const phoneFmt = (p) => { const d = String(p || "").replace(/\D/g, "").replace(/^591/, ""); return d.length === 8 ? `${d.slice(0, 3)}-${d.slice(3)}` : p || ""; };
export const waLink = (p, text) => `https://wa.me/${String(p || "").replace(/\D/g, "")}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

export const STATUS = { new: "Nuevo", confirmed: "Confirmado", preparing: "En preparación", cooking: "En la brasa", ready: "Listo", out_for_delivery: "En camino", delivered: "Entregado", cancelled: "Cancelado" };
export const NEXT = { new: ["confirmed", "Confirmar"], confirmed: ["preparing", "Empezar"], preparing: ["cooking", "A la brasa"], cooking: ["ready", "¡Listo!"] };
export const nextStep = (o) => o.status === "ready" ? (o.service === "delivery" ? ["out_for_delivery", "Despachar"] : ["delivered", "Entregar"]) : o.status === "out_for_delivery" ? ["delivered", "Entregado"] : NEXT[o.status] || null;
export const FLOW = { delivery: ["new", "confirmed", "preparing", "cooking", "ready", "out_for_delivery"], pickup: ["new", "confirmed", "preparing", "cooking", "ready"] };
export const ROLES = { owner: "Dueño", admin: "Administrador", manager: "Gerente", cashier: "Caja", kitchen: "Cocina", rider: "Repartidor" };
export const CHANNELS = { web: "Web", campeia: "Campe-IA", whatsapp: "WhatsApp", phone: "Teléfono", walk_in: "En local", pedidosya: "PedidosYa", yango: "Yango", alex: "Alex Delivery" };
export const SERVICES = { delivery: "Delivery", pickup: "Para recoger", dine_in: "En mesa" };
export const PAYMENTS = { cash: "Efectivo", qr: "QR", card: "Tarjeta", delivery_app: "App de delivery", other: "Otro" };
export const statusPill = (s) => `<span class="pill s-${s}">${esc(STATUS[s] || s)}</span>`;
export const storeName = (id) => (state.stores.find((s) => s.id === id) || {}).name || id;
export const role = () => state.staff && state.staff.role;
export const is = (...roles) => roles.includes(role());
export const isAdmin = () => is("owner", "admin");
export const myStores = () => (isAdmin() ? state.stores : state.stores.filter((s) => s.id === state.staff.store_id));

const ERR = {
  not_staff: "Tu usuario no tiene acceso.", not_your_store: "Esa sucursal no es la tuya.", closed_needs_manager: "Reabrir un pedido cerrado requiere un gerente.",
  role_not_allowed: "Tu rol no puede hacer ese cambio.", not_delivery: "Ese pedido no es delivery.", cancel_reason_required: "Elegí un motivo de cancelación.",
  cancel_note_required: "Escribí una nota para «Otro».", cancel_needs_manager: "Cancelar después de empezar requiere un gerente.", recall_needs_manager: "Volver atrás requiere un gerente.",
  not_admin: "Solo dueño o administrador.", owner_only: "Solo el dueño puede hacer eso.", weak_password: "La contraseña necesita al menos 8 caracteres.", bad_email: "Correo inválido.",
  email_taken: "Ese correo ya existe.", cant_demote_self: "No podés quitarte permisos a vos mismo.", store_paused: "La sucursal está pausada.", invalid_phone: "Teléfono inválido.",
  missing_address: "Falta la dirección.", missing_name: "Falta el nombre.", no_items: "Agregá productos.", promo_not_today: "Ese combo no vale para ese día.", item_not_at_store: "Ese producto no está en esa sucursal.",
  rate_limited: "Demasiados pedidos seguidos con ese número.", customer_blocked: "Cliente bloqueado.", "Invalid login credentials": "Correo o contraseña incorrectos.",
};
export function errMsg(e) {
  const m = String((e && (e.message || e.error_description || e)) || "Error");
  if (m.startsWith("sold_out:")) return `Agotado: ${m.slice(9)}`;
  if (m.startsWith("unknown_item:")) return "Producto desconocido.";
  if (/permission denied|row-level security/i.test(m)) return "No tenés permiso para eso.";
  if (/Failed to fetch|NetworkError/i.test(m)) return "Sin conexión. Probá de nuevo.";
  return ERR[m] || m;
}
export function toast(msg, err) { const t = document.createElement("div"); t.className = `toast ${err ? "toast--err" : ""}`; t.textContent = msg; $("#toasts").appendChild(t); setTimeout(() => t.remove(), 3200); }

let openLayer = null;
function layer(cls, html, onClose) {
  closeLayer();
  const scrim = document.createElement("div"); scrim.className = "scrim";
  const box = document.createElement("div"); box.className = cls; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.innerHTML = html;
  document.body.append(scrim, box);
  const prev = document.activeElement;
  const close = () => { scrim.remove(); box.remove(); document.removeEventListener("keydown", key); openLayer = null; if (onClose) onClose(); if (prev && prev.focus) prev.focus(); };
  const key = (e) => { if (e.key === "Escape") close(); };
  scrim.addEventListener("click", close); document.addEventListener("keydown", key);
  box.addEventListener("click", (e) => { if (e.target.closest("[data-x]")) close(); });
  openLayer = close;
  setTimeout(() => { const f = box.querySelector("input, select, textarea, button:not([data-x])"); if (f) f.focus(); }, 30);
  return { box, close };
}
export const closeLayer = () => openLayer && openLayer();
export const drawer = (title, body, onClose) => layer("drawer", `<div class="dhead"><h2>${esc(title)}</h2><button class="x" data-x aria-label="Cerrar">✕</button></div>${body}`, onClose);
export const modal = (title, body, onClose) => layer("modal", `<div class="dhead"><h2>${esc(title)}</h2><button class="x" data-x aria-label="Cerrar">✕</button></div>${body}`, onClose);
export function confirmBox(title, text) {
  return new Promise((res) => { const { box, close } = modal(title, `<p>${esc(text)}</p><div class="row"><button class="btn btn--primary" data-ok>Sí</button><button class="btn btn--ghost" data-x>No</button></div>`, () => res(false));
    box.querySelector("[data-ok]").addEventListener("click", () => { res(true); close(); }); });
}

// beep (unlocked on first tap)
let actx = null;
document.addEventListener("pointerdown", () => { if (!actx) try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* */ } }, { once: true });
export function beep() {
  if (!actx) return;
  const t = actx.currentTime;
  [0, 0.18].forEach((d, i) => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = i ? 1175 : 880; o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.16); o.start(t + d); o.stop(t + d + 0.17); });
}
export function csv(name, rows) {
  if (!rows.length) return toast("No hay datos para exportar.");
  const keys = Object.keys(rows[0]);
  const body = [keys.join(","), ...rows.map((r) => keys.map((k) => `"${String(r[k] == null ? "" : r[k]).replace(/"/g, '""')}"`).join(","))].join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function storeSelect(id, { all = isAdmin(), value } = {}) {
  const opts = myStores().map((s) => `<option value="${esc(s.id)}" ${value === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("");
  return `<select class="input" id="${id}">${all ? `<option value="">Todas las sucursales</option>` : ""}${opts}</select>`;
}
