// Campe-IA · deterministic tools. The model proposes tool calls; this file validates and executes.
// Every price, total, deal, opening hour and order is computed here from js/data.js — never by the model.
const crypto = require("crypto");
const D = require("../js/data.js");
const CFG = require("../js/config.js");

const CAT = D.catalog();
const C = D.config;
const MAX_LINES = 30, MAX_QTY = 50;
const KIND_RANK = { main: 0, combo: 1, promo: 2, drink: 3, side: 4, sauce: 5, extra: 6, dessert: 7 };

// ---------- text helpers ----------
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ\s]/g, " ").replace(/\s+/g, " ").trim();
const words = (s) => norm(s).split(" ").filter(Boolean);
const money = (n) => `${C.currency} ${Number(n).toLocaleString("es-BO", { maximumFractionDigits: 2 })}`;
const STOP = new Set(["de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas", "y", "con", "a", "al", "en", "por", "para", "quiero", "dame", "me", "mi", "porfa", "por favor", "que", "q", "hay", "tienen", "tenes", "tenés", "the", "a", "of", "and", "i", "want", "some", "please", "x"]);

// Local words, slang and English → menu words. A word with a synonym is REPLACED by it.
// Multi-word keys consume their words. Teach new words here from the `campeia_miss` logs (+ a test).
const SYNONYMS = {
  "pechuga": "pecho", "pechito": "pecho", "breast": "pecho",
  "muslo": "pierna", "pata": "pierna", "piernita": "pierna", "leg": "pierna", "thigh": "pierna",
  "cuartito": "cuarto", "quarter": "cuarto", "presa": "cuarto",
  "chicken": "pollo", "pollito": "pollo", "pollo frito": "broaster", "frito": "broaster", "crocante": "broaster", "crispy": "broaster", "fried": "broaster",
  "nuggets": "pipocas", "popcorn": "pipocas", "pipoca": "pipocas", "bocaditos": "pipocas",
  "papitas": "papas", "fritas": "papas", "fries": "papas", "chips": "papas",
  "platano": "platanos", "plantain": "platanos", "maduro": "platanos", "chipilo": "platanos",
  "rice": "arroz", "arrocito": "arroz",
  "picante": "aji", "llajua": "aji", "spicy": "aji", "salsa": "aji", "hot sauce": "aji",
  "lasagna": "lasana", "lasagne": "lasana", "lasaña": "lasana", "pasta": "lasana",
  "salad": "ensalada", "caesar": "cesar",
  "whole": "entero", "familiar": "entero", "completo": "entero", "pollo entero": "entero",
  "para compartir": "combo", "compartir": "combo", "promo": "combo", "promocion": "combo", "oferta": "combo", "deal": "combo",
  "carne": "carne", "beef": "carne", "meat": "carne",
};
const SYN_KEYS = Object.keys(SYNONYMS).map((k) => [words(k), SYNONYMS[k]]).sort((a, b) => b[0].length - a[0].length);

function expandQuery(q) {
  const ws = words(q);
  const out = [], drop = [];
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    if ((w === "sin" || w === "without" || w === "no") && ws[i + 1]) { // "sin X" drops X
      const nxt = SYN_KEYS.find(([k]) => k.length === 1 && k[0] === ws[i + 1]);
      drop.push(nxt ? nxt[1] : ws[i + 1]); i++; continue;
    }
    const hit = SYN_KEYS.find(([k]) => k.every((kw, j) => ws[i + j] === kw));
    if (hit) { out.push(...words(hit[1])); i += hit[0].length - 1; continue; }
    if (!STOP.has(w)) out.push(w);
  }
  return { terms: out, drop };
}

function itemText(it) {
  const cat = (D.menu.find((c) => c.id === it.cat) || {}).name || it.cat;
  const extra = it.kind === "promo" || it.kind === "combo" ? " combo promo" : "";
  const piece = /cuarto|brasa/.test(norm(it.name)) ? " cuarto brasa pollo" : /pollo|broaster|pipocas/.test(norm(it.name)) ? " pollo" : "";
  return words(`${it.name} ${it.desc} ${cat}${extra}${piece}`);
}
const wordMatch = (iw, q) => iw.some((w) => w === q || (q.length >= 3 && w.startsWith(q)));

function searchItems(query, { limit = 8 } = {}) {
  const { terms, drop } = expandQuery(query);
  if (!terms.length && !drop.length) return [];
  const scored = [];
  for (const it of Object.values(CAT)) {
    const iw = itemText(it);
    if (drop.some((d) => wordMatch(iw, d))) continue;
    let score = 0;
    const nw = norm(it.name).split(" ");
    for (const t of terms) if (wordMatch(iw, t)) score += (nw.includes(t) ? 2 : 1) + (nw[0] === t ? 1 : 0);
    if (terms.length && !score) continue;
    scored.push({ it, score: score + (norm(it.name) === norm(query) ? 5 : 0) });
  }
  scored.sort((a, b) => b.score - a.score || KIND_RANK[a.it.kind] - KIND_RANK[b.it.kind] || a.it.price - b.it.price);
  return scored.slice(0, limit).map((s) => s.it);
}

function resolveItem(ref) {
  if (!ref) return { error: "falta el producto" };
  if (CAT[ref]) return { item: CAT[ref] };
  const exact = Object.values(CAT).find((it) => norm(it.name) === norm(ref));
  if (exact) return { item: exact };
  const res = searchItems(ref, { limit: 6 });
  if (!res.length) return { error: "not_found" };
  if (res.length === 1) return { item: res[0] };
  // Clear winner? (top scores higher than the rest)
  const { terms } = expandQuery(ref);
  const sc = (it) => terms.filter((t) => wordMatch(itemText(it), t)).length;
  const top = sc(res[0]);
  const ties = res.filter((r) => sc(r) === top);
  if (ties.length === 1) return { item: res[0] };
  return { options: ties.slice(0, 4) };
}

// ---------- state ----------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const branchById = (id) => D.branches.find((b) => b.id === id);
function normPhone(p) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith(C.phonePrefix) && d.length === C.phonePrefix.length + C.phoneDigits) d = d.slice(C.phonePrefix.length);
  if (d.length !== C.phoneDigits || !/^[67]/.test(d)) return null; // Bolivian mobiles: 6xxxxxxx / 7xxxxxxx
  return `+${C.phonePrefix}${d}`;
}
const cleanStr = (s, n) => (typeof s === "string" ? s.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n) : "");

function emptyState() {
  return { cart: {}, prevCart: null, order: {}, stage: "browsing", token: null, upsold: false, newsShown: false, history: [], placed: null };
}

function sanitizeCart(c) {
  const out = {};
  if (!c || typeof c !== "object") return out;
  for (const [id, q] of Object.entries(c).slice(0, MAX_LINES)) {
    if (!CAT[id]) continue;
    const n = Math.max(1, Math.min(MAX_QTY, Math.floor(Number(q) || 0)));
    if (Number(q) >= 1) out[id] = n;
  }
  return out;
}

function sanitizeState(raw) {
  const s = emptyState();
  if (!raw || typeof raw !== "object") return s;
  s.cart = sanitizeCart(raw.cart);
  s.prevCart = raw.prevCart ? sanitizeCart(raw.prevCart) : null;
  const o = raw.order && typeof raw.order === "object" ? raw.order : {};
  if (o.service === "delivery" || o.service === "pickup") s.order.service = o.service;
  if (branchById(o.branch)) s.order.branch = o.branch;
  for (const k of ["address", "reference", "notes"]) if (cleanStr(o[k], 240)) s.order[k] = cleanStr(o[k], 240);
  if (cleanStr(o.name, 60)) s.order.name = cleanStr(o.name, 60);
  if (normPhone(o.phone)) s.order.phone = normPhone(o.phone);
  if (o.when === "asap" || /^([01]\d|2[0-3]):[0-5]\d$/.test(o.when || "")) s.order.when = o.when;
  if (cleanStr(o.payment, 40)) s.order.payment = cleanStr(o.payment, 40);
  const loc = o.location;
  if (loc && Number.isFinite(+loc.lat) && Number.isFinite(+loc.lng) && Math.abs(loc.lat) <= 90 && Math.abs(loc.lng) <= 180)
    s.order.location = { lat: Math.round(+loc.lat * 1e6) / 1e6, lng: Math.round(+loc.lng * 1e6) / 1e6 };
  if (["browsing", "awaiting_confirmation", "placed"].includes(raw.stage)) s.stage = raw.stage;
  if (typeof raw.token === "string" && /^[a-f0-9]{16}$/.test(raw.token)) s.token = raw.token;
  s.upsold = !!raw.upsold; s.newsShown = !!raw.newsShown;
  if (Array.isArray(raw.history)) s.history = raw.history.slice(-3).map((h) => ({
    id: cleanStr(h && h.id, 20), at: cleanStr(h && h.at, 30), branch: branchById(h && h.branch) ? h.branch : null,
    service: h && (h.service === "delivery" || h.service === "pickup") ? h.service : null, cart: sanitizeCart(h && h.cart),
    track: h && typeof h.track === "string" && UUID.test(h.track) ? h.track : null,
  })).filter((h) => h.id && Object.keys(h.cart).length);
  if (raw.placed && typeof raw.placed === "object" && typeof raw.placed.token === "string") {
    s.placed = { token: cleanStr(raw.placed.token, 16), code: cleanStr(raw.placed.code, 20), url: /^https:\/\/wa\.me\//.test(raw.placed.url || "") ? raw.placed.url : null,
      track: UUID.test(raw.placed.track || "") ? raw.placed.track : null, total: Number(raw.placed.total) || 0, branch: branchById(raw.placed.branch) ? raw.placed.branch : null };
  }
  if (s.stage === "placed" && !s.placed) s.stage = "browsing";
  if (s.stage === "awaiting_confirmation" && !s.token) s.stage = "browsing";
  return s;
}

// ---------- pricing ----------
function cartLines(cart) {
  return Object.entries(cart).map(([id, qty]) => ({ id, name: CAT[id].name, qty, unit: CAT[id].price, total: CAT[id].price * qty }));
}
const cartTotal = (cart) => cartLines(cart).reduce((a, l) => a + l.total, 0);
function cartView(cart) {
  const lines = cartLines(cart);
  return { lines: lines.map((l) => ({ id: l.id, name: l.name, qty: l.qty, unit_price: l.unit, line_total: l.total })), total: cartTotal(cart), total_text: money(cartTotal(cart)), items: lines.reduce((a, l) => a + l.qty, 0) };
}

function availabilityIssue(item, { now, branch } = {}) {
  if (item.channelOnly === "yango") return `${item.name} es solo por Yango.`;
  if (item.day != null && !D.promoValid(item, now)) {
    const n = now || D.localNow();
    if (item.until && n.ymd > item.until) return `${item.name} ya no está vigente.`;
    return `${item.name} es solo los ${D.DAYS[item.day]}.`;
  }
  if (branch && item.excl && item.excl.includes(branch)) {
    const b = branchById(branch);
    return `${item.name} no está disponible en ${b ? b.name : branch}.`;
  }
  return null;
}

// multiset of combo parts present in cart?
function partsCoverage(cart, parts) {
  const need = {}; for (const p of parts) need[p] = (need[p] || 0) + 1;
  const missing = [];
  for (const [p, n] of Object.entries(need)) if ((cart[p] || 0) < n) missing.push(p);
  return { need, missing };
}
const partsPrice = (parts) => parts.reduce((a, p) => a + (CAT[p] ? CAT[p].price : 0), 0);

function comboHints(cart, now) {
  const hints = [];
  for (const c of D.combos) {
    const item = CAT[c.id];
    if (availabilityIssue(item, { now })) continue;
    if (cart[c.id]) continue;
    const { need, missing } = partsCoverage(cart, c.parts);
    if (missing.length) continue; // only fire when every food part is already there (the combo adds the drink)
    const after = { ...cart };
    for (const [p, n] of Object.entries(need)) { after[p] -= n; if (after[p] <= 0) delete after[p]; }
    after[c.id] = 1;
    const sep = partsPrice(c.parts), diff = c.price - sep;
    const base = { combo_id: c.id, combo: c.name, combo_price: c.price, parts_price: sep, includes_drink: c.drink || null, total_now: cartTotal(cart), total_if_accepted: cartTotal(after) };
    if (diff <= 0) hints.push({ type: "switch_to_combo", ...base, saving: -diff, text: `Con el ${c.name} pagás ${money(c.price)} en vez de ${money(sep)}${c.drink ? ` y te incluye ${c.drink}` : ""}.` });
    else if (c.drink) hints.push({ type: "almost_combo", ...base, extra: diff, text: `Por ${money(diff)} más te llevás el ${c.name}, que incluye ${c.drink}.` });
  }
  return hints.sort((a, b) => (b.saving || 0) - (a.saving || 0));
}

function todaysPromo(now) {
  const n = now || D.localNow();
  const w = D.activeWeekly(n).find((x) => x.day === n.dow);
  return w || null;
}

// ---------- order helpers ----------
function detailsMissing(st) {
  const o = st.order, miss = [];
  if (!Object.keys(st.cart).length) miss.push("cart");
  if (!o.service) miss.push("service");
  if (!o.branch) miss.push("branch");
  if (o.service === "delivery" && !o.address && !o.location) miss.push("address");
  if (!o.when) miss.push("when");
  if (!o.name) miss.push("name");
  if (!o.phone) miss.push("phone");
  return miss;
}
function orderToken(st) {
  const o = st.order;
  const basis = JSON.stringify([Object.entries(st.cart).sort(), o.service, o.branch, o.address, o.reference, o.location, o.when, o.name, o.phone, o.payment, o.notes]);
  return crypto.createHash("sha256").update(basis).digest("hex").slice(0, 16);
}
const branchWa = (b) => (b && b.whatsapp) || C.callCenter;
const mapsLink = (loc) => `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
function localCode(token) {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const h = crypto.createHash("sha256").update(token).digest();
  return `${C.codePrefix}-` + Array.from({ length: 5 }, (_, i) => A[h[i] % A.length]).join("");
}
function whenText(w) { return w === "asap" ? "lo antes posible" : `a las ${w}`; }

function buildWhatsAppText({ code, cart, order, total, trackUrl, deliveryFee }) {
  const b = branchById(order.branch);
  const L = [`¡Hola ${C.brand}! ${C.emoji} Quiero hacer un pedido:`];
  if (code) L.push(`Pedido ${code}`);
  for (const l of cartLines(cart)) L.push(`• ${l.qty} × ${l.name} — ${money(l.total)}`);
  L.push(`Total: ${money(total)}${order.service === "delivery" ? (deliveryFee ? ` + delivery ${money(deliveryFee)}` : " (+ delivery a confirmar)") : ""}`);
  L.push(`Servicio: ${order.service === "delivery" ? "Delivery" : "Para recoger"}`);
  if (b) L.push(`Sucursal: ${b.name}`);
  if (order.service === "delivery") {
    if (order.address) L.push(`Dirección: ${order.address}${order.reference ? ` (Ref: ${order.reference})` : ""}`);
    if (order.location) L.push(`Ubicación: ${mapsLink(order.location)}`);
  }
  L.push(`Hora: ${whenText(order.when)}`);
  if (order.name) L.push(`Nombre: ${order.name}`);
  if (order.phone) L.push(`WhatsApp: ${order.phone}`);
  if (order.payment) L.push(`Pago: ${order.payment}`);
  if (order.notes) L.push(`Nota: ${order.notes}`);
  if (trackUrl) L.push(`Seguí tu pedido: ${trackUrl}`);
  return L.join("\n");
}
const waUrl = (num, text) => `https://wa.me/${num}?text=${encodeURIComponent(text)}`;

function siteUrl(ctx) { return (CFG.siteUrl || ctx.siteUrl || "").replace(/\/$/, ""); }
function trackUrl(ctx, token) { const base = siteUrl(ctx); return token && base ? `${base}${CFG.trackPath}?t=${token}` : null; }

function backendPayload(st, clientRef, channel) {
  const o = st.order;
  return { client_ref: clientRef, channel, store: o.branch, service: o.service, customer_name: o.name, customer_phone: o.phone,
    address: o.address || null, reference: o.reference || null, lat: o.location ? o.location.lat : null, lng: o.location ? o.location.lng : null,
    scheduled_for: o.when && o.when !== "asap" ? o.when : null, notes: [o.payment ? `Pago: ${o.payment}` : "", o.notes || ""].filter(Boolean).join(" · ") || null,
    items: Object.entries(st.cart).map(([id, qty]) => ({ id, qty })) };
}

const BACKEND_ERRORS = {
  store_paused: "La sucursal pausó los pedidos por ahora.",
  delivery_unavailable: "Esa sucursal no está haciendo delivery ahora.",
  pickup_unavailable: "Esa sucursal no está tomando pedidos para recoger ahora.",
  invalid_phone: "El número de WhatsApp no es válido.",
  missing_address: "Falta la dirección para el delivery.",
  rate_limited: "Hubo demasiados pedidos seguidos con ese número; esperá unos minutos.",
  customer_blocked: "No podemos tomar este pedido por aquí; escribí a la sucursal.",
  promo_not_today: "Uno de los combos no vale para hoy.",
  item_not_at_store: "Uno de los productos no está disponible en esa sucursal.",
};
function backendReason(err) {
  const e = String(err || "");
  if (e.startsWith("sold_out:")) return `Se agotó ${e.slice(9)} en esa sucursal.`;
  if (e.startsWith("unknown_item:")) return "Uno de los productos ya no está en el menú.";
  return BACKEND_ERRORS[e] || "La sucursal no pudo registrar el pedido.";
}

// ---------- the session ----------
function createSession(rawState, opts = {}) {
  const st = sanitizeState(rawState);
  const ctx = { now: () => D.localNow(opts.date ? new Date(opts.date) : new Date()), backend: opts.backend || null, siteUrl: opts.siteUrl || "", log: opts.log || ((x) => console.log(JSON.stringify(x))), channel: opts.channel || "text" };
  const events = [];
  const emit = (e) => events.push(e);
  const emitCart = () => emit({ type: "cart", cart: { ...st.cart } });
  const snap = () => { st.prevCart = { ...st.cart }; };
  const touch = () => { if (st.stage === "awaiting_confirmation") { st.stage = "browsing"; st.token = null; } };
  const missLog = (text, reason) => ctx.log({ evt: `${C.slug}_miss`, text: String(text).slice(0, 200), reason });

  const T = {
    search_menu({ query }) {
      const eq = expandQuery(query || "");
      if (/\b(vegetarian[oa]?s?|vegan[oa]?s?|veggie|meat ?free)\b/.test(norm(query)) || (!eq.terms.filter((t) => !["algo", "opcion", "opciones", "anything", "something", "comida", "plato", "platos", "tenes", "tienen"].includes(t)).length && eq.drop.some((d) => ["carne", "pollo"].includes(d)))) {
        const sides = Object.values(CAT).filter((i) => i.kind === "side");
        return { results: sides.map((it) => ({ id: it.id, name: it.name, price: it.price, price_text: money(it.price), kind: it.kind })),
          note: "El menú publicado no tiene platos vegetarianos: todo es pollo, lasañas o ensalada César. Lo único sin carne en el nombre son las guarniciones sueltas; cómo se preparan (aceite, caldo) hay que consultarlo en la sucursal." };
      }
      const res = searchItems(query || "");
      if (!res.length) { missLog(query, "search_empty"); return { results: [], note: "Nada en el menú coincide. Ofrecé ver categorías (pollos, combos, pastas, ensaladas, guarniciones)." }; }
      const now = ctx.now();
      return { results: res.map((it) => ({ id: it.id, name: it.name, price: it.price, price_text: money(it.price), kind: it.kind, desc: it.desc, hot: it.hot || undefined,
        availability: availabilityIssue(it, { now }) || undefined, not_at: it.excl && it.excl.length ? it.excl.map((b) => branchById(b).name) : undefined })) };
    },

    get_item_details({ item }) {
      const r = resolveItem(item);
      if (r.options) return { ambiguous: true, options: r.options.map((o) => ({ id: o.id, name: o.name, price: o.price })) };
      if (!r.item) { missLog(item, "item_unknown"); return { error: "No encontré ese producto en el menú." }; }
      const it = r.item, now = ctx.now();
      const inCombos = D.combos.filter((c) => c.parts.includes(it.id) && c.id !== it.id).map((c) => ({ id: c.id, name: c.name, price: c.price, days: CAT[c.id].day != null ? D.DAYS[CAT[c.id].day] : "todos los días", includes: c.note }));
      const weekly = D.activeWeekly(now).filter((w) => w.cats.includes(it.cat) && it.kind === "main").map((w) => ({ day: w.name, title: w.title, price: w.price }));
      return { id: it.id, name: it.name, price: it.price, price_text: money(it.price), kind: it.kind, description: it.desc,
        served_with: /brasa/.test(it.id) || it.kind === "promo" ? D.base + " (según las fotos de los combos)." : undefined,
        includes: it.drink ? `Incluye ${it.drink}.` : undefined,
        availability: availabilityIssue(it, { now }) || "disponible",
        not_available_at: it.excl.length ? it.excl.map((b) => branchById(b).name) : undefined,
        combos_with_it: inCombos.length ? inCombos : undefined, weekly_promos: weekly.length ? weekly : undefined,
        allergens: "No tenemos información de alérgenos publicada. Para alergias, consultá directamente con la sucursal." };
    },

    get_whats_new() {
      st.newsShown = true;
      const now = ctx.now(), tp = todaysPromo(now), sp = D.special;
      return {
        new_items: Object.values(CAT).filter((i) => i.hot).map((i) => ({ id: i.id, name: i.name, price: i.price })),
        special: sp && now.ymd <= sp.reserveUntil ? { name: sp.name, price: sp.price, serves: sp.serves, includes: sp.includes, reserve: `Reserva al ${fmtPhone(sp.reservePhone)} hasta el 20/12 con el pago total`, pickup: sp.pickup, how: "Se reserva por teléfono/WhatsApp; no se pide por el carrito." } : null,
        combos: D.combos.map((c) => ({ id: c.id, name: c.name, price: c.price, includes: c.note, days: c.day != null ? `solo ${D.DAYS[c.day]}` : "todos los días" })),
        today_promo: tp ? { title: tp.title, price: tp.price, desc: tp.desc, only: tp.yangoOnly ? "solo por Yango" : undefined } : null,
      };
    },

    get_branches({ name } = {}) {
      const now = ctx.now();
      let list = D.branches;
      if (name) {
        const q = norm(name);
        const f = list.filter((b) => norm(b.name).includes(q) || norm(b.address).includes(q) || b.id === name);
        if (f.length) list = f; else { const r = searchBranch(name); list = r ? [r] : []; }
      }
      if (!list.length) return { error: "No encontré esa sucursal.", branches: D.branches.map((b) => b.name) };
      const fmt = (b) => {
        const s = D.branchStatus(b, now);
        return { id: b.id, name: b.name, address: b.address, maps: b.maps || null, whatsapp: fmtPhone(branchWa(b)), own_whatsapp: !!b.whatsapp,
          status: s.state === "unknown" ? "horario no publicado" : s.state === "open" ? "abierta" : s.state === "closing" ? `cierra pronto (${s.closesAt})` : `cerrada, abre ${s.today ? "hoy" : "mañana"} a las ${s.opensAt}`,
          hours: b.open ? `${b.open}–${b.close}` : null, combos: b.noPromos ? "los combos del día no valen aquí" : undefined };
      };
      if (!name) return { count: list.length, note: "Los horarios por sucursal no están publicados.", branches: list.map((b) => ({ id: b.id, name: b.name, status: fmt(b).status })) };
      return { branches: list.slice(0, 5).map(fmt) };
    },

    get_deals() {
      const now = ctx.now(), tp = todaysPromo(now);
      const combos = D.combos.map((c) => {
        const sep = partsPrice(c.parts);
        return { id: c.id, name: c.name, price: c.price, includes: c.note, days: c.day != null ? `solo ${D.DAYS[c.day]}` : "todos los días",
          available_today: !availabilityIssue(CAT[c.id], { now }), food_separately: sep, saving_vs_food: sep > c.price ? sep - c.price : 0, drink_included: c.drink || null };
      });
      const hints = comboHints(st.cart, now);
      if (tp) {
        const applies = Object.keys(st.cart).filter((id) => tp.cats.includes(CAT[id].cat) && CAT[id].kind === "main");
        hints.push({ type: "promo_of_the_day", title: tp.title, price: tp.price, desc: tp.desc, yango_only: !!tp.yangoOnly, applies_to: applies.map((id) => CAT[id].name) });
      }
      const sp = D.special;
      if (sp && now.ymd <= sp.reserveUntil) hints.push({ type: "special", name: sp.name, price: sp.price, note: `${sp.serves}. Reserva al ${fmtPhone(sp.reservePhone)} hasta el 20/12.` });
      return { today: D.DAYS[now.dow], today_promo: tp ? { title: tp.title, price: tp.price, desc: tp.desc, only: tp.yangoOnly ? "solo por Yango" : undefined } : "hoy no hay combo del día",
        combos, hints, rule: "Citá los totales tal cual (total_if_accepted). No calcules nada." };
    },

    cart_add({ items }) {
      if (!Array.isArray(items) || !items.length) return { error: "Indicá qué producto agregar." };
      const added = [], problems = [], options = [];
      const now = ctx.now();
      snap();
      for (const req of items.slice(0, 10)) {
        const ref = req && (req.item || req.id || req.name);
        if (!CAT[ref] && !Object.values(CAT).some((i) => i.kind === "drink") && /\b(soda|sodas|coca|cola|gaseosa|refresco|bebida|drink|jugo|agua|fanta|sprite)\b/.test(norm(ref))) {
          missLog(ref, "drink_not_on_menu");
          problems.push({ asked: ref, reason: "Las bebidas sueltas no figuran en el menú publicado; vienen incluidas en los combos." });
          continue;
        }
        let r = resolveItem(ref);
        if (r.options) { options.push({ asked: ref, options: r.options.map((o) => ({ id: o.id, name: o.name, price: o.price })) }); continue; }
        if (!r.item) {
          missLog(ref, "cart_add_unknown");
          const soda = /soda|coca|gaseosa|refresco|bebida|drink|jugo/.test(norm(ref));
          problems.push({ asked: ref, reason: soda ? "Las bebidas sueltas no figuran en el menú publicado; vienen incluidas en los combos." : "No está en el menú." });
          continue;
        }
        if (req.size) { problems.push({ asked: ref, reason: `${r.item.name} no viene en tamaños.` }); }
        const issue = availabilityIssue(r.item, { now, branch: st.order.branch });
        if (issue) { problems.push({ asked: ref, reason: issue }); continue; }
        if (!st.cart[r.item.id] && Object.keys(st.cart).length >= MAX_LINES) { problems.push({ asked: ref, reason: "El pedido llegó al máximo de líneas." }); continue; }
        const q = Math.max(1, Math.min(MAX_QTY, Math.floor(Number(req.qty) || 1)));
        st.cart[r.item.id] = Math.min(MAX_QTY, (st.cart[r.item.id] || 0) + q);
        added.push({ id: r.item.id, name: r.item.name, qty: q, unit_price: r.item.price });
      }
      if (added.length) { touch(); emitCart(); }
      return { added, problems: problems.length ? problems : undefined, needs_choice: options.length ? options : undefined, cart: cartView(st.cart), hints: comboHints(st.cart, now).slice(0, 1) };
    },

    cart_remove({ item }) {
      const r = resolveItem(item), id = r.item && st.cart[r.item.id] ? r.item.id : Object.keys(st.cart).find((k) => r.options && r.options.some((o) => o.id === k));
      if (!id) return { error: "Eso no está en el pedido.", cart: cartView(st.cart) };
      snap(); delete st.cart[id]; touch(); emitCart();
      return { removed: CAT[id].name, cart: cartView(st.cart) };
    },

    cart_set_qty({ item, qty }) {
      const r = resolveItem(item), id = r.item && st.cart[r.item.id] ? r.item.id : null;
      if (!id) return { error: "Eso no está en el pedido.", cart: cartView(st.cart) };
      snap();
      const q = Math.floor(Number(qty) || 0);
      if (q <= 0) delete st.cart[id]; else st.cart[id] = Math.min(MAX_QTY, q);
      touch(); emitCart();
      return { cart: cartView(st.cart) };
    },

    cart_clear() { snap(); st.cart = {}; touch(); emitCart(); return { cart: cartView(st.cart) }; },
    cart_view() { return { cart: cartView(st.cart), hints: comboHints(st.cart, ctx.now()).slice(0, 1) }; },
    cart_undo() {
      if (!st.prevCart) return { error: "No hay nada para deshacer.", cart: cartView(st.cart) };
      st.cart = st.prevCart; st.prevCart = null; touch(); emitCart();
      return { cart: cartView(st.cart) };
    },

    cart_swap_to_combo({ combo_id }) {
      const c = D.combos.find((x) => x.id === combo_id || norm(x.name) === norm(combo_id));
      if (!c) return { error: "Ese combo no existe." };
      const issue = availabilityIssue(CAT[c.id], { now: ctx.now(), branch: st.order.branch });
      if (issue) return { error: issue };
      const { need, missing } = partsCoverage(st.cart, c.parts);
      if (missing.length) return { error: `Al pedido le falta ${missing.map((m) => CAT[m].name).join(", ")} para armar el ${c.name}.` };
      snap();
      for (const [p, n] of Object.entries(need)) { st.cart[p] -= n; if (st.cart[p] <= 0) delete st.cart[p]; }
      st.cart[c.id] = (st.cart[c.id] || 0) + 1;
      touch(); emitCart();
      return { swapped_to: c.name, includes: c.note, cart: cartView(st.cart) };
    },

    suggest_upsell() {
      if (st.upsold) return { suggestion: null, note: "Ya sugeriste algo en esta conversación. No insistas." };
      if (!Object.keys(st.cart).length) return { suggestion: null };
      const hint = comboHints(st.cart, ctx.now())[0];
      st.upsold = true;
      if (hint) return { suggestion: hint };
      // drinks: none sold loose → an add-on that fits a chicken order
      const hasChicken = Object.keys(st.cart).some((id) => CAT[id].cat === "pollos" && CAT[id].kind === "main");
      for (const id of hasChicken ? ["papas", "platanos", "aji"] : ["aji"]) if (!st.cart[id] && CAT[id]) {
        return { suggestion: { type: "addon", id, name: CAT[id].name, price: CAT[id].price, total_if_accepted: cartTotal({ ...st.cart, [id]: 1 }) } };
      }
      return { suggestion: null };
    },

    get_my_orders() {
      if (!st.history.length) return { orders: [], note: "No hay pedidos guardados en este dispositivo." };
      return { orders: st.history.slice().reverse().map((h, i) => ({ index: i + 1, code: h.id, at: h.at, branch: h.branch ? branchById(h.branch).name : null, service: h.service, items: cartLines(h.cart).map((l) => `${l.qty} × ${l.name}`), total_now: cartTotal(h.cart) })) };
    },

    reorder({ index } = {}) {
      const list = st.history.slice().reverse();
      const h = list[(Math.floor(Number(index) || 1)) - 1];
      if (!h) return { error: "No encontré ese pedido." };
      snap();
      const now = ctx.now(), skipped = [];
      st.cart = {};
      for (const [id, q] of Object.entries(h.cart)) { const iss = availabilityIssue(CAT[id], { now }); if (iss) skipped.push(iss); else st.cart[id] = q; }
      if (h.branch) st.order.branch = h.branch;
      if (h.service) st.order.service = h.service;
      touch(); emitCart();
      return { loaded: h.id, cart: cartView(st.cart), skipped: skipped.length ? skipped : undefined, branch: h.branch ? branchById(h.branch).name : null, service: h.service };
    },

    set_order_details(args = {}) {
      const errors = [], o = st.order, now = ctx.now();
      const before = JSON.stringify(o);
      if (args.service != null) {
        const s = norm(args.service);
        if (/deliv|domicilio|envio|llev(a|e)n|casa/.test(s)) o.service = "delivery";
        else if (/pick|recog|retir|paso|para llevar|sucursal|local/.test(s)) o.service = "pickup";
        else errors.push("Servicio: delivery o para recoger.");
      }
      if (args.branch != null) {
        const b = searchBranch(args.branch);
        if (!b) errors.push(`No encontré la sucursal «${cleanStr(args.branch, 40)}».`);
        else {
          const bad = Object.keys(st.cart).map((id) => availabilityIssue(CAT[id], { now, branch: b.id })).filter(Boolean);
          if (bad.length) errors.push(...bad); else o.branch = b.id;
        }
      }
      for (const k of ["address", "reference", "notes", "payment"]) if (args[k] != null && cleanStr(args[k], 240)) o[k] = cleanStr(args[k], k === "payment" ? 40 : 240);
      if (args.name != null && cleanStr(args.name, 60)) o.name = cleanStr(args.name, 60);
      if (args.phone != null) { const p = normPhone(args.phone); if (p) o.phone = p; else errors.push("El WhatsApp debe ser un celular boliviano de 8 dígitos (empieza con 6 o 7)."); }
      if (args.when != null) {
        const w = norm(args.when);
        if (/^(asap|ya|ahora|lo antes posible|cuanto antes|ahorita|now)$/.test(w)) o.when = "asap";
        else {
          const m = String(args.when).match(/^(\d{1,2})[:h.](\d{2})$/) || String(args.when).match(/^(\d{1,2})$/);
          if (!m) errors.push("La hora debe ser «lo antes posible» o HH:MM.");
          else {
            const hh = +m[1], mm = +(m[2] || 0);
            if (hh > 23 || mm > 59) errors.push("Esa hora no es válida.");
            else if (hh * 60 + mm < now.min + 15) errors.push("Esa hora ya pasó o es muy pronto; elegí al menos 15 minutos desde ahora.");
            else o.when = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
          }
        }
      }
      if (o.branch && o.when) {
        const b = branchById(o.branch);
        if (b.open) {
          const t = o.when === "asap" ? now : { ...now, min: +o.when.slice(0, 2) * 60 + +o.when.slice(3) };
          const s = D.branchStatus(b, t);
          if (s.state === "closed") { errors.push(`${b.name} está cerrada a esa hora (abre ${s.opensAt}).`); if (o.when === "asap") delete o.when; }
        }
      }
      if (JSON.stringify(o) !== before) touch();
      const missing = detailsMissing(st);
      return { ok: !errors.length, errors: errors.length ? errors : undefined, order: publicOrder(o), missing, ask_next: missing[0] || null };
    },

    request_location() { emit({ type: "location" }); return { shown: true, note: "Se mostró el botón para compartir ubicación. Esperá que el cliente lo use." }; },

    prepare_order() {
      const missing = detailsMissing(st);
      if (missing.length) return { ready: false, missing };
      const now = ctx.now(), o = st.order;
      const issues = Object.keys(st.cart).map((id) => availabilityIssue(CAT[id], { now, branch: o.branch })).filter(Boolean);
      if (issues.length) return { ready: false, problems: issues };
      st.token = orderToken(st); st.stage = "awaiting_confirmation";
      const b = branchById(o.branch), view = cartView(st.cart);
      const summary = { lines: view.lines, total: view.total, total_text: view.total_text, delivery_fee: o.service === "delivery" ? "a confirmar por la sucursal" : null,
        service: o.service === "delivery" ? "Delivery" : "Para recoger", branch: b.name, address: o.service === "delivery" ? [o.address, o.reference && `Ref: ${o.reference}`, o.location && "📍 ubicación compartida"].filter(Boolean).join(" · ") : null,
        when: whenText(o.when), name: o.name, phone: o.phone, payment: o.payment || null, notes: o.notes || null };
      emit({ type: "readback", summary });
      emit({ type: "options", options: ["Sí, confirmar", "Cambiar algo"] });
      return { ready: true, readback: summary, instruction: "Mostrá el resumen y TERMINÁ el turno. No digas «confirmado». Esperá un sí explícito." };
    },

    async place_order({ token } = {}) {
      if (st.stage === "placed" && st.placed && (!token || token === st.placed.token)) {
        emit({ type: "order", id: st.placed.code, url: st.placed.url, track: trackUrl(ctx, st.placed.track), branch: branchById(st.placed.branch).name, total: st.placed.total, entry: null });
        return { already_placed: true, code: st.placed.code, instruction: "El pedido ya está confirmado. Decile que toque el botón de WhatsApp." };
      }
      if (st.stage !== "awaiting_confirmation" || !st.token) return { error: "Primero hay que preparar el pedido (prepare_order) y recibir un sí." };
      if (token !== st.token || orderToken(st) !== st.token) { st.stage = "browsing"; st.token = null; return { error: "El pedido cambió desde el resumen. Prepará el resumen de nuevo." }; }
      const o = st.order, b = branchById(o.branch);
      let code = localCode(st.token), total = cartTotal(st.cart), track = null, fee = null;
      if (ctx.backend) {
        const res = await ctx.backend.placeOrder(backendPayload(st, `${C.slug}-${st.token}-${o.phone.replace(/\D/g, "")}`, C.slug));
        if (res && res.ok) { code = res.code; total = Number(res.total); track = res.tracking_token; fee = Number(res.delivery_fee) || null; }
        else if (res && res.error && !res.unreachable) {
          st.stage = "awaiting_confirmation";
          return { error: "backend_rejected", reason: backendReason(res.error), instruction: "Explicale el motivo en palabras simples y ofrecé una alternativa (otra sucursal, quitar el producto o hablar con una persona)." };
        } else ctx.log({ evt: `${C.slug}_backend_unreachable`, code });
      }
      const tUrl = trackUrl(ctx, track);
      const text = buildWhatsAppText({ code, cart: st.cart, order: o, total, trackUrl: tUrl, deliveryFee: fee });
      const url = waUrl(branchWa(b), text);
      const entry = { id: code, at: new Date().toISOString(), branch: o.branch, service: o.service, cart: { ...st.cart }, track };
      st.history = [...st.history, entry].slice(-3);
      st.placed = { token: st.token, code, url, track, total, branch: o.branch };
      st.stage = "placed";
      emit({ type: "order", id: code, url, track: tUrl, branch: b.name, total, entry });
      return { placed: true, code, total_text: money(total), branch: b.name, instruction: "Decile que el pedido está listo y que toque el botón verde para enviarlo por WhatsApp. No pegues links." };
    },

    async get_order_status() {
      const last = st.placed || (st.history.length ? { code: st.history[st.history.length - 1].id, track: st.history[st.history.length - 1].track, branch: st.history[st.history.length - 1].branch } : null);
      if (!last) return { error: "No hay pedidos en este dispositivo." };
      const b = branchById(last.branch);
      emit({ type: "handoff", url: waUrl(branchWa(b), `Hola, consulto por mi pedido ${last.code}`), to: b ? b.name : "Pollos Campeón" });
      if (!last.track || !ctx.backend) return { code: last.code, status: "unknown", note: "Este pedido no tiene seguimiento en línea; la sucursal te responde por WhatsApp." };
      const r = await ctx.backend.trackOrder(last.track);
      if (!r || !r.ok) return { code: last.code, status: "unknown", note: "No pude consultar el estado ahora. Probá el botón de WhatsApp." };
      emit({ type: "track", url: trackUrl(ctx, last.track), code: r.code });
      return { code: r.code, status: r.status, status_text: STATUS_TEXT[r.status] || r.status, service: r.service, last_update: (r.events || []).slice(-1)[0] || null };
    },

    handoff_to_human({ reason, summary } = {}) {
      const b = branchById(st.order.branch);
      const text = [`Hola ${C.brand}, necesito ayuda.`, reason ? `Motivo: ${cleanStr(reason, 200)}` : "", summary ? `Resumen: ${cleanStr(summary, 400)}` : ""].filter(Boolean).join("\n");
      emit({ type: "handoff", url: waUrl(branchWa(b), text), to: b ? b.name : "Atención Pollos Campeón" });
      return { handed_off: true, to: b ? b.name : "central de pedidos", instruction: "Decile que toque el botón para hablar con una persona." };
    },

    show_options({ options } = {}) {
      const opts = (Array.isArray(options) ? options : []).map((x) => cleanStr(String(x), 40)).filter(Boolean).slice(0, 4);
      if (opts.length >= 2) emit({ type: "options", options: opts });
      return { shown: opts.length >= 2 };
    },

    log_miss({ text, reason } = {}) { missLog(text || "", reason || "model"); return { logged: true }; },
  };

  function publicOrder(o) { return { ...o, branch: o.branch ? branchById(o.branch).name : undefined, location: o.location ? "compartida" : undefined }; }

  async function run(name, args) {
    const fn = T[name];
    if (!fn) return { error: `Herramienta desconocida: ${name}` };
    try { return await fn(args && typeof args === "object" ? args : {}); }
    catch (e) { ctx.log({ evt: `${C.slug}_tool_error`, tool: name, msg: String(e && e.message) }); return { error: "Error interno de la herramienta." }; }
  }

  return { state: st, run, events, drain: () => events.splice(0, events.length), stateEvent: () => ({ type: "state", state: st }) };
}

const STATUS_TEXT = { new: "recibido", confirmed: "confirmado por la sucursal", preparing: "en preparación", cooking: "en la brasa", ready: "listo", out_for_delivery: "en camino", delivered: "entregado", cancelled: "cancelado" };

function searchBranch(ref) {
  const q = norm(ref);
  if (!q) return null;
  const id = D.branches.find((b) => b.id === ref || b.id === q);
  if (id) return id;
  const ws = q.split(" ").filter((w) => w.length > 2 && !["sucursal", "zona", "avenida", "the"].includes(w));
  let best = null, bs = 0;
  for (const b of D.branches) {
    const bw = words(`${b.name} ${b.address} ${b.id} ${b.num || ""}`);
    const s = ws.filter((w) => bw.some((x) => x.startsWith(w))).length + (norm(b.name) === q ? 5 : 0) + (b.num && b.num.split(" ").includes(q) ? 3 : 0);
    if (s > bs) { bs = s; best = b; }
  }
  return bs ? best : null;
}
function fmtPhone(n) { const d = String(n).replace(/^591/, ""); return d.length === 8 ? `${d.slice(0, 3)}-${d.slice(3)}` : d; }

// ---------- tool schemas (one source → both providers) ----------
const S = (props, req = []) => ({ type: "object", properties: props, required: req, additionalProperties: false });
const str = (d) => ({ type: "string", description: d });
const TOOL_DEFS = [
  ["search_menu", "Busca en el menú por nombre, ingrediente o tipo (acepta jerga y «sin X»).", S({ query: str("lo que pidió el cliente") }, ["query"])],
  ["get_item_details", "Precio, descripción, combos y promos de un producto. Siempre incluye el aviso de alérgenos.", S({ item: str("id o nombre") }, ["item"])],
  ["get_whats_new", "Novedades: productos nuevos, especial de temporada, combos y la promo de hoy.", S({})],
  ["get_branches", "Sucursales: dirección, WhatsApp, estado. Sin nombre devuelve la lista.", S({ name: str("nombre o zona (opcional)") })],
  ["get_deals", "Promo de hoy, combos con ahorro y sugerencias según el carrito (total_if_accepted).", S({})],
  ["cart_add", "Agrega productos al carrito.", S({ items: { type: "array", items: S({ item: str("id o nombre"), qty: { type: "integer", minimum: 1, maximum: 50 }, size: str("tamaño, si lo dijo") }, ["item"]) } }, ["items"])],
  ["cart_remove", "Quita un producto del carrito.", S({ item: str("id o nombre") }, ["item"])],
  ["cart_set_qty", "Cambia la cantidad de un producto (0 lo quita).", S({ item: str("id o nombre"), qty: { type: "integer", minimum: 0, maximum: 50 } }, ["item", "qty"])],
  ["cart_clear", "Vacía el carrito.", S({})],
  ["cart_view", "Muestra el carrito y su total.", S({})],
  ["cart_undo", "Deshace el último cambio del carrito.", S({})],
  ["cart_swap_to_combo", "Reemplaza los productos sueltos por el combo indicado.", S({ combo_id: str("id del combo") }, ["combo_id"])],
  ["suggest_upsell", "Una sola sugerencia por conversación (combo, luego un extra).", S({})],
  ["get_my_orders", "Mi Pedido: últimos pedidos hechos en este dispositivo.", S({})],
  ["reorder", "Carga en el carrito un pedido anterior («lo de siempre»).", S({ index: { type: "integer", minimum: 1, maximum: 3, description: "1 = el último" } })],
  ["set_order_details", "Guarda datos del pedido y devuelve qué falta. Solo los datos que el cliente dijo.", S({
    service: str("delivery o recoger"), branch: str("sucursal"), address: str("dirección"), reference: str("referencia"),
    when: str("«asap» o HH:MM"), name: str("nombre"), phone: str("WhatsApp (8 dígitos)"), payment: str("solo si el cliente lo dijo"), notes: str("nota") })],
  ["request_location", "Muestra el botón «Compartir mi ubicación» para el delivery.", S({})],
  ["prepare_order", "Verifica y arma el resumen para confirmar. Después terminá el turno.", S({})],
  ["place_order", "Confirma el pedido. SOLO después de un sí explícito al resumen.", S({ token: str("token del resumen") }, ["token"])],
  ["get_order_status", "Estado en vivo del último pedido.", S({})],
  ["handoff_to_human", "Pasa la conversación a una persona por WhatsApp.", S({ reason: str("motivo"), summary: str("resumen breve") }, ["reason"])],
  ["show_options", "Muestra 2 a 4 botones de respuesta rápida.", S({ options: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 } }, ["options"])],
  ["log_miss", "Registra algo que no pudiste responder.", S({ text: str("lo que pidió"), reason: str("por qué") }, ["text"])],
];
const anthropicTools = () => TOOL_DEFS.map(([name, description, input_schema]) => ({ name, description, input_schema }));
const openaiTools = () => TOOL_DEFS.map(([name, description, parameters]) => ({ type: "function", function: { name, description, parameters } }));

module.exports = { createSession, sanitizeState, emptyState, searchItems, expandQuery, resolveItem, normPhone, cartTotal, cartView, comboHints, buildWhatsAppText, backendPayload, orderToken, anthropicTools, openaiTools, TOOL_DEFS, SYNONYMS, CAT, money, fmtPhone, backendReason, STATUS_TEXT };
