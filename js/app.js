/* Pollos Campeón · site app (vanilla, one IIFE). Reads window.CAMPEON (js/data.js) + window.CAMPEON_CONFIG. */
(function () {
  "use strict";
  const D = window.CAMPEON, CFG = window.CAMPEON_CONFIG || {}, C = D.config;
  const CAT = D.catalog();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => `${C.currency} ${Number(n).toLocaleString("es-BO", { maximumFractionDigits: 2 })}`;
  const icon = (id) => `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(k, d, s = localStorage) { try { const v = s.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v, s = localStorage) { try { s.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
  };
  const fmtPhone = (n) => { const d = String(n).replace(/^591/, ""); return d.length === 8 ? `${d.slice(0, 3)}-${d.slice(3)}` : d; };
  const branchById = (id) => D.branches.find((b) => b.id === id);
  const branchWa = (b) => (b && b.whatsapp) || C.callCenter;

  // ---------- clock (?day=0..6 simulates a weekday for QA) ----------
  const qsDay = new URLSearchParams(location.search).get("day");
  function now() {
    const n = D.localNow();
    if (qsDay != null && /^[0-6]$/.test(qsDay)) n.dow = +qsDay;
    return n;
  }
  function itemIssue(id, branch) {
    const it = CAT[id];
    if (!it) return "Ese producto no está en el menú.";
    if (it.channelOnly === "yango") return `${it.name} es solo por Yango.`;
    if (it.day != null && !D.promoValid(it, now())) return now().ymd > (it.until || "9999") ? `${it.name} ya no está vigente.` : `${it.name} es solo los ${D.DAYS[it.day]}.`;
    if (branch && it.excl && it.excl.includes(branch)) return `${it.name} no está disponible en ${branchById(branch).name}.`;
    return null;
  }

  // ---------- toast ----------
  let toastT;
  function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("is-on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("is-on"), 2600); }

  // ---------- cart (shared with Campe-IA) ----------
  let cart = sanitizeCart(store.get("campeon.cart", {}));
  function sanitizeCart(c) { const o = {}; for (const [id, q] of Object.entries(c || {})) if (CAT[id] && q >= 1) o[id] = Math.min(50, Math.floor(q)); return o; }
  const cartTotal = () => Object.entries(cart).reduce((a, [id, q]) => a + CAT[id].price * q, 0);
  const cartCount = () => Object.values(cart).reduce((a, q) => a + q, 0);
  function setCart(next, { silent } = {}) {
    cart = sanitizeCart(next); store.set("campeon.cart", cart);
    renderCartUI(!silent);
  }
  function addToCart(id, qty = 1) {
    const issue = itemIssue(id);
    if (issue) { toast(issue); return false; }
    const n = { ...cart }; n[id] = Math.min(50, (n[id] || 0) + qty); setCart(n);
    toast(`Agregado: ${CAT[id].name} ✓`); return true;
  }
  function renderCartUI(bump) {
    const n = cartCount();
    $$("[data-count]").forEach((b) => { b.textContent = n; b.hidden = !n; if (bump) { b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump"); } });
    const body = $("#dr-body");
    if (!n) body.innerHTML = `<div class="empty"><p><b>Tu pedido está vacío.</b></p><p>Elegí algo del menú o pedile a Campe-IA.</p><a class="btn btn--primary btn--sm" href="#menu" data-close-cart>Ver el menú</a></div>`;
    else body.innerHTML = Object.entries(cart).map(([id, q]) => `<div class="cline"><div class="cline__n">${esc(CAT[id].name)}<small>${money(CAT[id].price)} c/u</small></div>
      <div class="qty"><button type="button" data-q="${id}" data-d="-1" aria-label="Quitar uno">−</button><span>${q}</span><button type="button" data-q="${id}" data-d="1" aria-label="Agregar uno">+</button></div><div class="cline__p">${money(CAT[id].price * q)}</div></div>`).join("");
    $("#dr-total").textContent = money(cartTotal());
    $("#mbar-cart").hidden = !n; $("#mbar-cart-t").textContent = n ? `${n} · ${money(cartTotal())}` : "";
    if (typeof renderFunnelCart === "function") renderFunnelCart();
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-add]");
    if (a) { e.preventDefault(); addToCart(a.dataset.add); return; }
    const q = e.target.closest("[data-q]");
    if (q) { const n = { ...cart }; n[q.dataset.q] = (n[q.dataset.q] || 0) + +q.dataset.d; if (n[q.dataset.q] <= 0) delete n[q.dataset.q]; setCart(n, { silent: true }); }
  });

  // drawer
  let lastFocus = null;
  function openCart() { lastFocus = document.activeElement; $("#drawer").classList.add("is-open"); $("#drawer").inert = false; $("#scrim").classList.add("is-open"); $("#drawer .xbtn").focus(); updateBars(); }
  function closeCart() { $("#drawer").classList.remove("is-open"); $("#drawer").inert = true; $("#scrim").classList.remove("is-open"); if (lastFocus) lastFocus.focus(); updateBars(); }
  $$("[data-open-cart]").forEach((b) => b.addEventListener("click", openCart));
  document.addEventListener("click", (e) => { if (e.target.closest("[data-close-cart]") || e.target.id === "scrim") closeCart(); });
  $("[data-continue]").addEventListener("click", () => { closeCart(); startFunnel(null, 2); });

  // ---------- ticker ----------
  function renderTicker() {
    const n = now();
    const cheapest = D.combos.reduce((a, c) => (c.price < a.price ? c : a));
    const tp = D.activeWeekly(n).find((w) => w.day === n.dow);
    const hot = Object.values(CAT).find((i) => i.hot && i.kind === "main");
    const sp = D.special && n.ymd <= D.special.reserveUntil ? D.special : null;
    const items = [
      `Combos <b>desde ${money(cheapest.price)}</b> · ${esc(cheapest.name)}`,
      sp ? `${esc(sp.name)} para 8 · <b>${money(sp.price)}</b> · reservá hasta el 20/12` : `<b>45 años</b> de pollo campeón`,
      tp ? `Hoy ${esc(D.DAYS[n.dow])}: <b>${esc(tp.title)} ${money(tp.price)}</b>${tp.yangoOnly ? " · solo por Yango" : ""}` : (hot ? `Probá las <b>${esc(hot.name)}</b> · ${money(hot.price)}` : ""),
      `Pedí por <b>WhatsApp 798-88975</b> o con <b>Campe-IA</b>`,
    ].filter(Boolean);
    const one = items.map((t) => `<span class="ticker__item">${icon("i-leg")}<span>${t}</span></span>`).join("");
    $("#ticker").innerHTML = one + one.replace(/<span class="ticker__item">/g, '<span class="ticker__item" aria-hidden="true">');
  }

  // ---------- header ----------
  const hdr = $("#hdr");
  function onScroll() {
    const tick = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--tick")) || 48;
    hdr.classList.toggle("is-solid", scrollY > tick);
    updateBars();
  }
  addEventListener("scroll", onScroll, { passive: true });
  const burger = $("#burger"), mpanel = $("#mpanel");
  function setPanel(open) { mpanel.classList.toggle("is-open", open); mpanel.inert = !open; burger.setAttribute("aria-expanded", String(open)); if (open) $(".mpanel__close").focus(); }
  burger.addEventListener("click", () => setPanel(true));
  mpanel.addEventListener("click", (e) => { if (e.target.closest("a, button")) setPanel(false); });

  // ---------- hero carousel ----------
  const slides = $$("#slides .slide"), dots = $("#dots"), hero = $(".hero");
  let cur = 0, timer = null, paused = false, heroVisible = true;
  slides.forEach((s, i) => {
    const b = document.createElement("button"); b.type = "button"; b.setAttribute("role", "tab"); b.setAttribute("aria-label", s.getAttribute("aria-label"));
    b.setAttribute("aria-selected", i === 0 ? "true" : "false"); b.addEventListener("click", () => go(i, true)); dots.appendChild(b);
  });
  function go(i, user) {
    cur = (i + slides.length) % slides.length;
    slides.forEach((s, k) => { const on = k === cur; s.classList.toggle("is-active", on); s.inert = !on; });
    $$("button", dots).forEach((b, k) => { b.setAttribute("aria-selected", String(k === cur)); b.tabIndex = k === cur ? 0 : -1; });
    hdr.classList.toggle("on-light", slides[cur].dataset.tone === "light");
    syncSlideVideo();
    if (user) restart();
  }
  function syncSlideVideo() {
    slides.forEach((s, k) => { const v = $("video", s); if (!v) return; if (k === cur && heroVisible) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } else v.pause(); });
  }
  function restart() { clearInterval(timer); if (!RM && !paused) timer = setInterval(() => go(cur + 1), 6500); }
  hero.addEventListener("mouseenter", () => { paused = true; clearInterval(timer); });
  hero.addEventListener("mouseleave", () => { paused = false; restart(); });
  hero.addEventListener("focusin", () => { paused = true; clearInterval(timer); });
  hero.addEventListener("focusout", () => { paused = false; restart(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) clearInterval(timer); else restart(); });
  dots.addEventListener("keydown", (e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); go(cur + (e.key === "ArrowRight" ? 1 : -1), true); $$("button", dots)[cur].focus(); } });
  let sx = null;
  hero.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
  hero.addEventListener("touchend", (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) go(cur + (dx < 0 ? 1 : -1), true); sx = null; });
  new IntersectionObserver(([en]) => { heroVisible = en.isIntersecting; syncSlideVideo(); }, { threshold: 0.2 }).observe(hero);
  // promo banners only add on their day
  $$("#slides [data-add]").forEach((b) => { const iss = itemIssue(b.dataset.add); if (iss) { b.disabled = true; b.textContent = CAT[b.dataset.add].day != null ? `Solo los ${D.DAYS[CAT[b.dataset.add].day]}` : "No disponible"; } });
  go(0); restart();

  // QR card
  const qr = $("#qrcard");
  if (store.get("campeon.qr.hidden", false, sessionStorage)) qr.hidden = true;
  $(".qrcard__x").addEventListener("click", () => { qr.hidden = true; store.set("campeon.qr.hidden", true, sessionStorage); });

  // ---------- branches + status ----------
  function statusOf(b) { return D.branchStatus(b, now()); }
  function openSummary() {
    const known = D.branches.filter((b) => b.open);
    if (!known.length) return { text: `<span class="dot"></span><span><b>${D.branches.length}</b> sucursales en Santa Cruz</span>`, short: `${D.branches.length} sucursales`, live: false };
    const open = known.filter((b) => ["open", "closing"].includes(statusOf(b).state)).length;
    if (open) return { text: `<span class="dot dot--live"></span><span><b>${open} de ${D.branches.length}</b> sucursales abiertas ahora</span>`, short: `${open} de ${D.branches.length} abiertas`, live: true };
    const nextOpen = known.map((b) => b.open).sort()[0];
    return { text: `<span class="dot dot--grey"></span><span>${now().min < toMin(nextOpen) ? "Abrimos hoy" : "Volvemos mañana desde"} las ${nextOpen}</span>`, short: "Cerrado ahora", live: false };
  }
  const toMin = (s) => +s.slice(0, 2) * 60 + +s.slice(3);
  function statusPill(b) {
    const s = statusOf(b);
    if (s.state === "open") return `<span class="st st--open"><span class="dot dot--live"></span>Abierta</span>`;
    if (s.state === "closing") return `<span class="st st--closing"><span class="dot dot--amber"></span>Cierra pronto</span>`;
    if (s.state === "closed") return s.today ? `<span class="st st--opens"><span class="dot dot--amber"></span>Abre ${s.opensAt}</span>` : `<span class="st st--closed"><span class="dot dot--red"></span>Cerrada</span>`;
    return `<span class="st st--unknown">Horario a confirmar</span>`;
  }
  function branchOptions(sel, { withCenter } = {}) {
    const opts = D.branches.map((b) => { const s = statusOf(b); const t = s.state === "open" ? " · Abierta" : s.state === "closing" ? " · Cierra pronto" : s.state === "closed" ? " · Cerrada" : ""; return `<option value="${b.id}">${esc(b.name)}${t}</option>`; }).join("");
    sel.innerHTML = `<option value="">Elegí una sucursal…</option>${opts}${withCenter ? `<option value="central">Central de pedidos · consultas generales</option>` : ""}`;
  }
  function renderBranches() {
    const n = now(), sum = openSummary();
    $$("[data-status-line]").forEach((el) => (el.innerHTML = sum.text));
    $$("[data-openline]").forEach((el) => { el.innerHTML = `<span class="dot ${sum.live ? "dot--live" : ""}"></span><span>${esc(sum.short)}</span>`; });
    $("#clockpill").innerHTML = `${String(n.hh).padStart(2, "0")}:${String(n.mm).padStart(2, "0")} en Santa Cruz · ${sum.live ? sum.short : `<b>${D.branches.length}</b> sucursales`}`;
    $("#branches").innerHTML = D.branches.map((b) => `<article class="bcard"><div class="bcard__top"><h3 class="bcard__name">${esc(b.name)}</h3>${statusPill(b)}</div>
      ${b.num ? `<span class="pill">Sucursal ${esc(b.num)}</span>` : ""}
      <p class="bcard__addr">${esc(b.address)}</p>${b.open ? `<p class="bcard__addr">${esc(b.open)}–${esc(b.close)}</p>` : ""}${b.noPromos ? `<p class="bcard__addr"><b>Los combos del día no aplican aquí.</b></p>` : ""}
      <div class="bcard__links">${b.maps ? `<a href="${esc(b.maps)}" target="_blank" rel="noopener">Cómo llegar ↗</a>` : ""}<a href="https://wa.me/${branchWa(b)}" target="_blank" rel="noopener">WhatsApp ${fmtPhone(branchWa(b))}</a></div></article>`).join("");
    for (const id of ["#ob-branch", "#f-branch"]) { const s = $(id), v = s.value; branchOptions(s, { withCenter: id === "#f-branch" }); s.value = v; }
  }
  $("#dlist").innerHTML = D.delivery.map((d) => d.url ? `<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a></li>` : `<li><span>${esc(d.name)}</span></li>`).join("");

  // ---------- order box ----------
  let obService = "delivery";
  $$("[data-ob]").forEach((b) => b.addEventListener("click", () => { obService = b.dataset.ob; $$("[data-ob]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); }));
  $("#orderbox").addEventListener("submit", (e) => { e.preventDefault(); startFunnel(obService, 2, $("#ob-branch").value); });

  // ---------- offers rail ----------
  $("#offers").innerHTML = D.offers.map((o) => `<a class="offer" href="${esc(o.href)}" target="_blank" rel="noopener"><img src="${esc(o.img)}" alt="${esc(o.alt)}" width="900" height="1125" loading="lazy" /></a>`).join("");
  $$("[data-rail]").forEach((r) => {
    const t = $(".rail__track", r), prev = $("[data-rail-prev]", r), next = $("[data-rail-next]", r);
    const upd = () => { prev.hidden = t.scrollLeft < 10; next.hidden = t.scrollLeft + t.clientWidth >= t.scrollWidth - 10; };
    prev.addEventListener("click", () => t.scrollBy({ left: -t.clientWidth * 0.8, behavior: "smooth" }));
    next.addEventListener("click", () => t.scrollBy({ left: t.clientWidth * 0.8, behavior: "smooth" }));
    t.addEventListener("scroll", upd, { passive: true }); addEventListener("resize", upd); upd();
  });

  // ---------- weekly promos ----------
  function renderWeekly() {
    const n = now(), list = D.activeWeekly(n);
    if (!list.length) { $("[data-weekly-section]").hidden = true; return; }
    const sorted = matchMedia("(max-width: 760px)").matches ? [...list].sort((a, b) => (b.day === n.dow) - (a.day === n.dow)) : list;
    $("#week").innerHTML = sorted.map((w) => {
      const today = w.day === n.dow;
      return `<article class="wcard ${today ? "is-today" : ""} ${w.yangoOnly ? "wcard--yango" : ""}">${today ? `<span class="pill pill--mustard wcard__today">Hoy</span>` : ""}
        <a class="wcard__art" href="${esc(w.url)}" target="_blank" rel="noopener"><img src="${esc(w.img)}" alt="Arte del ${esc(w.title)}" width="900" height="1125" loading="lazy" /></a>
        <span class="wcard__day">${esc(w.name)}</span><h3 class="wcard__title">${esc(w.title)}</h3><p class="wcard__desc">${esc(w.desc)}</p>
        <div class="wcard__price"><small>Bs</small>${w.price}</div>
        <div class="wcard__foot">${w.yangoOnly ? `<span class="pill pill--dark">Solo por Yango</span>` : today ? `<button class="btn btn--accent btn--sm" data-add="${w.id}">Agregar</button>` : `<span class="pill">Solo ${esc(w.name.toLowerCase())}</span>`}
        <button class="wcard__link" type="button" data-tab-jump="${esc(w.cats[0])}">Ver ${esc((D.menu.find((m) => m.id === w.cats[0]) || {}).name || "menú")} →</button></div></article>`;
    }).join("");
    $("#week-note").textContent = `${D.weeklyNote} Viernes a domingo, sin combo del día.`;
  }
  document.addEventListener("click", (e) => { const j = e.target.closest("[data-tab-jump]"); if (j) { selectTab(j.dataset.tabJump); $("#menu").scrollIntoView({ behavior: RM ? "auto" : "smooth" }); } });

  // ---------- special ----------
  function renderSpecial() {
    const sp = D.special;
    if (!sp || now().ymd > sp.reserveUntil) { $("[data-special]").hidden = true; return; }
    $("#sp-eyebrow").textContent = sp.eyebrow;
    $("#sp-title").innerHTML = `${esc(sp.name.split(" ")[0])} <span class="hl">${esc(sp.name.split(" ").slice(1).join(" "))}</span>`;
    $("#sp-lede").textContent = `${sp.serves}. ${sp.pickup}`;
    $("#sp-price").innerHTML = `<small>Bs</small>${sp.price}`;
    $("#sp-list").innerHTML = sp.includes.map((i) => `<li>${esc(i)}</li>`).join("");
    $("#sp-terms").textContent = `Reservá al ${fmtPhone(sp.reservePhone)} hasta el 20 de diciembre de 2026. ${sp.terms}`;
    $("#sp-cta").href = `https://wa.me/${sp.reservePhone}?text=${encodeURIComponent(`¡Hola! Quiero reservar el ${sp.name} 🎄`)}`;
  }

  // ---------- menu ----------
  let tab = D.menu[0].id, showAll = false;
  const isPhone = () => matchMedia("(max-width: 760px)").matches;
  $("#tabs").innerHTML = D.menu.map((m) => `<button class="tab" role="tab" type="button" data-tab="${m.id}" aria-selected="${m.id === tab}">${esc(m.name)}</button>`).join("");
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) selectTab(b.dataset.tab); });
  function selectTab(id) { if (!D.menu.some((m) => m.id === id)) return; tab = id; showAll = false; $$("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === id))); renderMenu(); }
  function renderMenu() {
    const cat = D.menu.find((m) => m.id === tab), items = cat.items;
    const limit = isPhone() && !showAll ? 6 : items.length;
    $("#mlist").innerHTML = items.slice(0, limit).map((it) => `<li class="mitem">${it.img ? `<img class="mitem__img" src="${esc(it.img)}" alt="" width="74" height="74" loading="lazy" />` : ""}
      <div class="mitem__txt"><h3 class="mitem__name">${esc(it.name)}${it.hot ? ` <span class="pill pill--red">Nuevo</span>` : ""}${it.veg ? ` <span class="pill">Sin carne</span>` : ""}</h3><p class="mitem__desc">${esc(it.desc)}</p></div>
      <span class="mitem__price">${money(it.price)}</span><button class="plus" type="button" data-add="${it.id}" aria-label="Agregar ${esc(it.name)}">${icon("i-plus")}</button></li>`).join("");
    const more = $("#mmore"); more.hidden = limit >= items.length; more.textContent = `Ver los ${items.length} ↓`;
  }
  $("#mmore").addEventListener("click", () => { showAll = true; renderMenu(); });
  $("#addons").innerHTML = D.addons.map((g) => `<div class="addon"><h3>${esc(g.name)}</h3><div class="chips">${g.items.map((i) => `<span class="chip">${esc(i.name)} <b>${money(i.price)}</b><button class="plus" type="button" data-add="${i.id}" aria-label="Agregar ${esc(i.name)}">${icon("i-plus")}</button></span>`).join("")}</div></div>`).join("");

  // ---------- combos + featured ----------
  function renderCombos() {
    $("#combo-grid").innerHTML = D.combos.map((c) => {
      const iss = itemIssue(c.id);
      return `<article class="ccard ${c.star ? "ccard--star" : ""} reveal"><div class="ccard__ph"><img src="${esc(c.img)}" alt="${esc(c.name)}: ${esc(c.note)}" width="720" height="540" loading="lazy" />
        <div class="ccard__badges">${c.fav ? `<span class="pill pill--mustard">Favorito</span>` : ""}${c.share ? `<span class="pill pill--mustard">Para compartir</span>` : ""}${c.hot ? `<span class="pill pill--red">Todos los días</span>` : ""}</div></div>
        <div class="ccard__body"><h3 class="ccard__name">${esc(c.name)}</h3><p class="ccard__note">${esc(c.note)}</p>
        <div class="ccard__foot"><div><div class="ccard__price"><small>Bs</small>${c.price}</div><div class="ccard__day">${c.day != null ? `Solo ${D.DAYS[c.day]}` : "Todos los días"}</div></div>
        <button class="plus plus--cream" type="button" data-add="${c.id}" ${iss ? `disabled title="${esc(iss)}"` : ""} aria-label="Agregar ${esc(c.name)}">${icon("i-plus")}</button></div></div></article>`;
    }).join("");
    $("#featured").innerHTML = D.featured.map((f) => `<article class="fcard reveal"><div class="fcard__media">${f.video ? `<video data-src="${esc(f.video)}.mp4" poster="${esc(f.img)}" muted playsinline loop preload="none" aria-label="${esc(f.name)}"></video>` : `<img src="${esc(f.img)}" alt="${esc(f.name)}" width="600" height="450" loading="lazy" />`}</div>
      <div class="fcard__body"><span class="pill pill--red">${esc(f.tag)}</span><h3 class="fcard__name">${esc(f.name)}</h3><p class="fcard__desc">${esc(f.desc)}</p>
      <div class="fcard__foot"><span class="fcard__price">${f.from ? "desde " : ""}${money(f.price)}</span><button class="plus" type="button" data-add="${f.ref}" aria-label="Agregar ${esc(f.name)}">${icon("i-plus")}</button></div></div></article>`).join("");
  }

  // ---------- reels ----------
  $("#reel-track").innerHTML = D.reels.map((r) => `<a class="reel" href="${esc(r.url)}" target="_blank" rel="noopener"><video data-src="${esc(r.src)}.mp4" poster="${esc(r.src)}.webp" muted playsinline loop preload="none" aria-label="${esc(r.caption)}"></video><span class="reel__cap">${icon("i-ig")}${esc(r.caption)}</span></a>`).join("");
  const rt = $("#reel-track");
  $("[data-reel-prev]").addEventListener("click", () => rt.scrollBy({ left: -rt.clientWidth * 0.7, behavior: "smooth" }));
  $("[data-reel-next]").addEventListener("click", () => rt.scrollBy({ left: rt.clientWidth * 0.7, behavior: "smooth" }));

  // videos outside the hero play only while ≥35% visible
  function watchVideos() {
    const io = new IntersectionObserver((ens) => ens.forEach((en) => { const v = en.target; if (en.isIntersecting && !RM) { if (!v.src) v.src = v.dataset.src; v.play().catch(() => {}); } else v.pause(); }), { threshold: 0.35 });
    $$("video[data-src]").forEach((v) => { if (!v.closest(".slide")) io.observe(v); });
  }

  // ---------- story + feed ----------
  const S = D.story;
  $("#h-eyebrow").textContent = S.eyebrow;
  $("#h-title").innerHTML = `45 años de <span class="hl">pollo campeón</span>`;
  $("#h-body").innerHTML = S.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("");
  $("#h-time").innerHTML = S.timeline.map((t) => `<li><b>${esc(t.year)}</b>${esc(t.text)}</li>`).join("");
  $("#feed").innerHTML = D.feed.map((f) => `<a href="${esc(f.url)}" target="_blank" rel="noopener"><img src="${esc(f.img)}" alt="${esc(f.alt)}" width="900" height="1125" loading="lazy" /></a>`).join("");
  $("#year").textContent = now().ymd.slice(0, 4);

  // footer: one dropdown open at a time, click outside closes
  const groups = $$(".fgroup");
  groups.forEach((g) => g.addEventListener("toggle", () => { if (g.open) groups.forEach((o) => o !== g && (o.open = false)); }));
  document.addEventListener("click", (e) => { if (!e.target.closest(".fgroup")) groups.forEach((g) => (g.open = false)); });

  // ---------- Mi Pedido history (shared with Campe-IA) ----------
  const history = () => store.get("campeon.history", []);
  function saveHistory(entry) { const h = history().filter((x) => x.id !== entry.id); h.push(entry); store.set("campeon.history", h.slice(-3)); }

  // ---------- WhatsApp funnel ----------
  const F = { step: 1, intent: null, when: "asap", ref: null, sentRef: null };
  const fmsg = (t) => ($("#fmsg").textContent = t || "");
  function startFunnel(intent, step, branch) {
    if (intent) { F.intent = intent; $$(".choice").forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.intent === intent))); }
    if (!F.intent) F.intent = "delivery";
    if (branch) $("#f-branch").value = branch;
    showStep(step || 1);
    $("#pedir").scrollIntoView({ behavior: RM ? "auto" : "smooth" });
  }
  $$("[data-start]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); startFunnel(null, cartCount() ? 2 : 1); }));
  $$(".choice").forEach((c) => c.addEventListener("click", () => { F.intent = c.dataset.intent; $$(".choice").forEach((x) => x.setAttribute("aria-pressed", String(x === c))); showStep(2); }));
  function showStep(s) {
    F.step = s; fmsg("");
    $$(".fstep").forEach((el) => (el.hidden = +el.dataset.step !== s));
    $$("#steps li").forEach((li) => li.classList.toggle("is-on", +li.dataset.s <= s));
    const kind = F.intent === "event" ? "event" : F.intent === "question" ? "question" : "order";
    $$("[data-for]").forEach((el) => (el.hidden = el.dataset.for !== kind));
    $$("[data-for-service]").forEach((el) => (el.hidden = F.intent !== "delivery"));
    $("#fback").hidden = s === 1; $("#fnext").hidden = s === 1 || s === 4;
    $("#fnext").textContent = s === 3 ? "Revisar →" : "Siguiente →";
    if (s === 4) renderReview();
    updatePreview();
  }
  $("#fback").addEventListener("click", () => showStep(Math.max(1, F.step - 1)));
  $("#fnext").addEventListener("click", () => { const err = validate(F.step); if (err) return fmsg(err); showStep(F.step + 1); });
  function renderFunnelCart() {
    const ul = $("#fcart"); if (!ul) return;
    ul.innerHTML = cartCount() ? Object.entries(cart).map(([id, q]) => `<li><span>${q} × ${esc(CAT[id].name)}</span><span>${money(CAT[id].price * q)} <button type="button" class="tchip" style="padding:2px 9px" data-q="${id}" data-d="-1" aria-label="Quitar uno">−</button></span></li>`).join("") + `<li><b>Total</b><b>${money(cartTotal())}</b></li>` : `<li>Todavía no agregaste nada. Buscá abajo 👇</li>`;
    updatePreview();
  }
  function renderPicker(q) {
    const nq = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const list = Object.values(CAT).filter((i) => !i.channelOnly && (!q || nq(i.name).includes(nq(q))) && !itemIssue(i.id)).slice(0, 30);
    $("#picker").innerHTML = list.map((i) => `<div class="picker__it"><span>${esc(i.name)}<b>${money(i.price)}</b></span><button class="plus" type="button" data-add="${i.id}" aria-label="Agregar ${esc(i.name)}">${icon("i-plus")}</button></div>`).join("") || `<p>Nada con ese nombre.</p>`;
  }
  $("#fsearch").addEventListener("input", (e) => renderPicker(e.target.value));
  $$("#f-when [data-when]").forEach((b) => b.addEventListener("click", () => { F.when = b.dataset.when; $$("#f-when [data-when]").forEach((x) => x.setAttribute("aria-pressed", String(x === b))); $("#f-time").hidden = F.when !== "later"; updatePreview(); }));
  $("#funnel").addEventListener("input", updatePreview);
  function normPhone(p) { let d = String(p || "").replace(/\D/g, ""); if (d.startsWith("591") && d.length === 11) d = d.slice(3); return d.length === 8 && /^[67]/.test(d) ? `+591${d}` : null; }
  function validate(s) {
    const isOrder = F.intent === "delivery" || F.intent === "pickup";
    if (s === 2) {
      if (isOrder && !cartCount()) return "Agregá al menos un producto.";
      if (F.intent === "event" && (!$("#ev-date").value || !$("#ev-guests").value)) return "Decinos la fecha y cuántas personas.";
      if (F.intent === "question" && !$("#q-text").value.trim()) return "Escribí tu consulta.";
    }
    if (s === 3) {
      if (!$("#f-name").value.trim()) return "¿A nombre de quién?";
      if (!normPhone($("#f-phone").value)) return "Tu WhatsApp: un celular de 8 dígitos que empiece con 6 o 7.";
      const br = $("#f-branch").value;
      if (!br) return "Elegí una sucursal.";
      if (isOrder && br === "central") return "Para un pedido elegí una sucursal.";
      if (F.intent === "delivery" && !$("#f-addr").value.trim()) return "Falta la dirección para el delivery.";
      if (F.when === "later") { const t = $("#f-time").value; if (!t) return "Elegí la hora."; if (toMin(t) < now().min + 15) return "Esa hora ya pasó o es muy pronto."; }
      if (isOrder) { const bad = Object.keys(cart).map((id) => itemIssue(id, br)).filter(Boolean); if (bad.length) return bad[0]; }
      const b = branchById(br);
      if (isOrder && b && b.open) { const st = D.branchStatus(b, F.when === "later" ? { ...now(), min: toMin($("#f-time").value) } : now()); if (st.state === "closed") return `${b.name} está cerrada a esa hora (abre ${st.opensAt}).`; }
    }
    return null;
  }
  function funnelOrder() {
    const br = $("#f-branch").value;
    return { service: F.intent === "pickup" ? "pickup" : "delivery", branch: br, name: $("#f-name").value.trim(), phone: normPhone($("#f-phone").value) || $("#f-phone").value.trim(),
      address: $("#f-addr").value.trim(), reference: $("#f-ref").value.trim(), when: F.when === "later" && $("#f-time").value ? $("#f-time").value : "asap", notes: $("#f-note").value.trim() };
  }
  function waText(code, trackUrl) {
    const o = funnelOrder(), b = branchById(o.branch);
    if (F.intent === "event") return [`¡Hola ${C.brand}! 🍗 Quiero reservar mesa / consultar por un evento.`, `Fecha: ${$("#ev-date").value || "-"}`, `Personas: ${$("#ev-guests").value || "-"}`, $("#ev-occ").value ? `Ocasión: ${$("#ev-occ").value}` : "", b ? `Sucursal: ${b.name}` : "", o.name ? `Nombre: ${o.name}` : "", o.phone ? `WhatsApp: ${o.phone}` : ""].filter(Boolean).join("\n");
    if (F.intent === "question") return [`¡Hola ${C.brand}! Tengo una consulta (${$("#q-topic").value}):`, $("#q-text").value.trim(), o.name ? `Nombre: ${o.name}` : ""].filter(Boolean).join("\n");
    const L = [`¡Hola ${C.brand}! ${C.emoji} Quiero hacer un pedido:`];
    if (code) L.push(`Pedido ${code}`);
    for (const [id, q] of Object.entries(cart)) L.push(`• ${q} × ${CAT[id].name} — ${money(CAT[id].price * q)}`);
    L.push(`Total: ${money(cartTotal())}${o.service === "delivery" ? " (+ delivery a confirmar)" : ""}`);
    L.push(`Servicio: ${o.service === "delivery" ? "Delivery" : "Para recoger"}`);
    if (b) L.push(`Sucursal: ${b.name}`);
    if (o.service === "delivery" && o.address) L.push(`Dirección: ${o.address}${o.reference ? ` (Ref: ${o.reference})` : ""}`);
    L.push(`Hora: ${o.when === "asap" ? "lo antes posible" : `a las ${o.when}`}`);
    if (o.name) L.push(`Nombre: ${o.name}`);
    if (o.phone) L.push(`WhatsApp: ${o.phone}`);
    if (o.notes) L.push(`Nota: ${o.notes}`);
    if (trackUrl) L.push(`Seguí tu pedido: ${trackUrl}`);
    return L.join("\n");
  }
  function updatePreview() {
    if (!F.intent) return;
    const br = $("#f-branch").value, b = branchById(br);
    $("#ph-to").textContent = b ? `${b.name} · ${fmtPhone(branchWa(b))}` : "Central de pedidos · 798-88975";
    $("#wa-preview").textContent = waText();
  }
  function renderReview() {
    const o = funnelOrder(), b = branchById(o.branch);
    const isOrder = F.intent === "delivery" || F.intent === "pickup";
    $("#review").innerHTML = `<ul class="fcart">${isOrder ? Object.entries(cart).map(([id, q]) => `<li><span>${q} × ${esc(CAT[id].name)}</span><span>${money(CAT[id].price * q)}</span></li>`).join("") + `<li><b>Total</b><b>${money(cartTotal())}</b></li>` : ""}
      <li><span>Enviar a</span><span>${esc(b ? b.name : "Central de pedidos")}</span></li></ul>
      <button type="button" class="btn btn--whatsapp btn--lg btn--block" id="fsend">${icon("i-wa")}Enviar por WhatsApp</button>`;
    $("#fsend").addEventListener("click", sendFunnel);
  }
  const DB_ERRORS = { store_paused: "La sucursal pausó los pedidos por ahora. Elegí otra o probá en un rato.", delivery_unavailable: "Esa sucursal no está haciendo delivery ahora.", pickup_unavailable: "Esa sucursal no está tomando pedidos para recoger ahora.",
    invalid_phone: "Revisá tu número de WhatsApp.", missing_address: "Falta la dirección para el delivery.", rate_limited: "Hiciste varios pedidos seguidos; esperá unos minutos.", customer_blocked: "No podemos tomar este pedido por la web. Escribí a la sucursal.",
    promo_not_today: "Uno de los combos no vale para hoy.", item_not_at_store: "Uno de los productos no está en esa sucursal." };
  const dbReason = (e) => e.startsWith("sold_out:") ? `Se agotó ${e.slice(9)} en esa sucursal. Quitalo o elegí otra sucursal.` : e.startsWith("unknown_item:") ? "Uno de los productos ya no está en el menú." : DB_ERRORS[e] || null;
  async function placeOrderRPC(payload) {
    if (!CFG.supabaseUrl || !CFG.supabaseKey) return { unreachable: true };
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
    try {
      const h = { apikey: CFG.supabaseKey, "Content-Type": "application/json" };
      if (/^eyJ/.test(CFG.supabaseKey)) h.Authorization = `Bearer ${CFG.supabaseKey}`;
      const r = await fetch(`${CFG.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/place_order`, { method: "POST", headers: h, body: JSON.stringify({ payload }), signal: ctl.signal });
      const data = await r.json().catch(() => null);
      if (r.ok && data && data.ok) return data;
      if (r.status >= 500 || !data) return { unreachable: true };
      return { error: String(data.message || data.error || "") };
    } catch { return { unreachable: true }; } finally { clearTimeout(t); }
  }
  const randId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  async function sendFunnel() {
    const btn = $("#fsend"); if (btn.disabled) return;
    const o = funnelOrder(), b = branchById(o.branch), wa = b ? branchWa(b) : C.callCenter;
    const isOrder = F.intent === "delivery" || F.intent === "pickup";
    const win = window.open("", "_blank"); // open synchronously so popup blockers allow it
    btn.disabled = true; btn.textContent = "Registrando…";
    let code = null, track = null;
    if (isOrder) {
      const sig = JSON.stringify([cart, o]);
      if (F.sentRef !== sig) { F.ref = randId(); F.sentRef = sig; } // same cart + details → same client_ref (idempotent)
      const res = await placeOrderRPC({ client_ref: `web-${F.ref}`, channel: "web", store: o.branch, service: o.service, customer_name: o.name, customer_phone: o.phone, address: o.address || null, reference: o.reference || null,
        lat: null, lng: null, scheduled_for: o.when === "asap" ? null : o.when, notes: o.notes || null, items: Object.entries(cart).map(([id, qty]) => ({ id, qty })) });
      if (res.error) {
        const why = dbReason(res.error) || "No pudimos registrar el pedido. Revisá los datos.";
        if (win) win.close(); btn.disabled = false; btn.innerHTML = `${icon("i-wa")}Enviar por WhatsApp`; fmsg(why); return;
      }
      if (res.ok) { code = res.code; track = res.tracking_token; }
    }
    const base = CFG.siteUrl || location.origin;
    const trackUrl = track ? `${base}${CFG.trackPath || "/sigue-tu-pollo/"}?t=${track}` : null;
    const url = `https://wa.me/${wa}?text=${encodeURIComponent(waText(code, trackUrl))}`;
    if (win) win.location.href = url; else location.href = url;
    if (isOrder) {
      saveHistory({ id: code || `WEB-${now().ymd}`, at: new Date().toISOString(), branch: o.branch, service: o.service, cart: { ...cart }, track });
      const sentCart = { ...cart }; setCart({}, { silent: true });
      $("#review").innerHTML = `<div class="success"><p>¡Listo! Se abrió WhatsApp con tu pedido.</p>${code ? `<p>Tu código</p><div class="success__code">${esc(code)}</div>` : `<p>Mandá el mensaje en WhatsApp para confirmar.</p>`}
        <div class="slide__ctas" style="justify-content:center">${trackUrl ? `<a class="btn btn--accent" href="${esc(trackUrl)}">📍 Seguí tu pedido</a>` : ""}<a class="btn btn--ghost" href="${esc(url)}" target="_blank" rel="noopener">Abrir WhatsApp otra vez</a></div></div>`;
      void sentCart;
    } else { btn.disabled = false; btn.innerHTML = `${icon("i-wa")}Enviar por WhatsApp`; }
  }

  // ---------- Campe-IA ----------
  const chat = $("#chat"), log = $("#log"), input = $("#chatin");
  let msgs = store.get("campeon.ai.msgs", [], sessionStorage);
  let aiState = store.get("campeon.ai.state", {}, sessionStorage);
  let busy = false;
  function persist() { store.set("campeon.ai.msgs", msgs.slice(-20), sessionStorage); store.set("campeon.ai.state", aiState, sessionStorage); }
  function openChat() { chat.classList.add("is-open"); chat.inert = false; document.body.classList.add("chat-open"); if (!log.childElementCount) greet(); setTimeout(() => input.focus(), 50); updateBars(); }
  function closeChat() { chat.classList.remove("is-open"); chat.inert = true; document.body.classList.remove("chat-open"); stopVoice(); updateBars(); }
  document.addEventListener("click", (e) => { if (e.target.closest("[data-open-chat]")) { e.preventDefault(); openChat(); } if (e.target.closest("[data-close-chat]")) closeChat(); });
  document.addEventListener("keydown", (e) => { if (e.key !== "Escape") return; if (chat.classList.contains("is-open")) closeChat(); else if ($("#drawer").classList.contains("is-open")) closeCart(); else if (mpanel.classList.contains("is-open")) setPanel(false); });
  function md(t) { // minimal safe markdown: **bold** + "- " lists
    const lines = esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").split("\n");
    let html = "", inList = false;
    for (const l of lines) { const m = l.match(/^\s*[-•]\s+(.*)/); if (m) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${m[1]}</li>`; } else { if (inList) { html += "</ul>"; inList = false; } if (l.trim()) html += `<p>${l}</p>`; } }
    return html + (inList ? "</ul>" : "");
  }
  function bubble(role, text) { const d = document.createElement("div"); d.className = `msg msg--${role}`; d.innerHTML = role === "bot" ? md(text) : esc(text); log.appendChild(d); scrollLog(); return d; }
  const scrollLog = () => { log.scrollTop = log.scrollHeight; };
  function chips(opts) { const w = document.createElement("div"); w.className = "qr"; w.innerHTML = opts.map((o) => `<button type="button">${esc(o)}</button>`).join(""); w.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { w.remove(); send(b.textContent); } }); log.appendChild(w); scrollLog(); }
  function greet() {
    for (const m of msgs) bubble(m.role === "user" ? "user" : "bot", m.content);
    if (!msgs.length) { bubble("bot", "¡Hola, campeón! 🍗 Soy Campe-IA. Te armo el pedido, te cuento las promos o te digo qué sucursal te queda cerca."); }
    const start = ["¿Qué promo hay hoy?", "Quiero pedir", "¿Qué sucursales hay?", "Opciones sin carne"];
    if (history().length) start.unshift("🍗 Lo de siempre");
    chips(start);
  }
  const okWa = (u) => typeof u === "string" && /^https:\/\/wa\.me\/\d+(\?text=.*)?$/.test(u);
  const okTrack = (u) => { try { const x = new URL(u); return x.pathname === (CFG.trackPath || "/sigue-tu-pollo/") && /^[0-9a-f-]{36}$/i.test(x.searchParams.get("t") || ""); } catch { return false; } };
  function cartCard(c) {
    const lines = Object.entries(c).filter(([id]) => CAT[id]);
    const total = lines.reduce((a, [id, q]) => a + CAT[id].price * q, 0);
    return `<h4>Tu pedido</h4><ul>${lines.map(([id, q]) => `<li><span>${q} × ${esc(CAT[id].name)}</span><span>${money(CAT[id].price * q)}</span></li>`).join("") || "<li>Vacío</li>"}</ul><div class="tot"><span>Total</span><span>${money(total)}</span></div>`;
  }
  function card(cls, html) { const d = document.createElement("div"); d.className = `ccardx ${cls || ""}`; d.innerHTML = html; log.appendChild(d); scrollLog(); return d; }
  function aiErr(kind) {
    const map = { 503: "Campe-IA se está preparando 🛠️ Muy pronto vas a poder pedir conmigo.", 404: "Campe-IA se está preparando 🛠️", 501: "Campe-IA se está preparando 🛠️", 405: "Campe-IA se está preparando 🛠️",
      429: "Muchas preguntas seguidas 😅 Esperá un minuto y seguimos.", network: "Se cortó la conexión. Probá de nuevo.", upstream: "Tuve un problema para responder. Probá de nuevo en un ratito.", rate_limited: "Muchas preguntas seguidas 😅 Esperá un minuto." };
    bubble("bot", `${map[kind] || map.upstream}\n\nMientras tanto podés ver el **menú** o pedir por **WhatsApp**.`);
    chips(["Ver el menú", "Pedir por WhatsApp"]);
  }
  log.addEventListener("click", (e) => { const b = e.target.closest(".qr button"); if (!b) return; if (b.textContent === "Ver el menú") { closeChat(); location.hash = "#menu"; } if (b.textContent === "Pedir por WhatsApp") { closeChat(); startFunnel(null, cartCount() ? 2 : 1); } });
  $("#chatform").addEventListener("submit", (e) => { e.preventDefault(); const t = input.value.trim(); if (t) { input.value = ""; send(t); } });

  async function send(text, { voice } = {}) {
    if (busy) return;
    if (text === "Ver el menú" || text === "Pedir por WhatsApp") return;
    busy = true;
    bubble("user", text);
    msgs.push({ role: "user", content: text });
    const st = { ...aiState, cart, history: history() };
    const wait = bubble("bot", ""); wait.innerHTML = `<span class="typing"><i></i><i></i><i></i></span>`;
    setVoice(voice ? "thinking" : null);
    let botText = "", botEl = null, cartEl = null, gotAny = false;
    try {
      const r = await fetch(`/api/${C.slug}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Campeia-Client": "1" }, body: JSON.stringify({ messages: msgs.slice(-16), state: st, channel: voice ? "voice" : "text" }) });
      const soft = r.headers.get("X-Campeia-Status");
      if (soft || !r.ok) { wait.remove(); msgs.pop(); persist(); aiErr(+(soft || r.status)); return; }
      const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (line.trim()) { gotAny = true; handle(JSON.parse(line)); } }
      }
    } catch { wait.remove(); msgs.pop(); persist(); aiErr("network"); return; }
    finally { busy = false; if (!botText) wait.remove(); }
    function handle(ev) {
      if (ev.type === "text") { if (!botEl) { botEl = wait; } botText += ev.text; botEl.innerHTML = md(botText); scrollLog(); }
      else if (ev.type === "cart") { setCart(ev.cart, { silent: false }); if (cartEl) cartEl.innerHTML = cartCard(ev.cart); else cartEl = card("", cartCard(ev.cart)); }
      else if (ev.type === "options" && Array.isArray(ev.options)) chips(ev.options.slice(0, 4).map(String));
      else if (ev.type === "readback") { const s = ev.summary; card("ccardx--receipt", `<h4>Revisá tu pedido</h4><ul>${s.lines.map((l) => `<li><span>${l.qty} × ${esc(l.name)}</span><span>${money(l.line_total)}</span></li>`).join("")}</ul><div class="tot"><span>Total</span><span>${money(s.total)}</span></div>
        <dl><dt>Servicio</dt><dd>${esc(s.service)}</dd><dt>Sucursal</dt><dd>${esc(s.branch)}</dd>${s.address ? `<dt>Dirección</dt><dd>${esc(s.address)}</dd>` : ""}<dt>Hora</dt><dd>${esc(s.when)}</dd><dt>Nombre</dt><dd>${esc(s.name)}</dd>${s.delivery_fee ? `<dt>Delivery</dt><dd>${esc(s.delivery_fee)}</dd>` : ""}</dl>`); }
      else if (ev.type === "location") { const c = card("", `<button class="btn btn--primary btn--sm">📍 Compartir mi ubicación</button>`); $("button", c).addEventListener("click", () => shareLocation(c)); }
      else if (ev.type === "order") {
        const parts = [`<h4>Pedido ${esc(ev.id)} listo</h4><p>Total ${money(ev.total)} · ${esc(ev.branch)}</p>`];
        if (okWa(ev.url)) parts.push(`<a class="btn btn--whatsapp btn--block" href="${esc(ev.url)}" target="_blank" rel="noopener">${icon("i-wa")}Enviar por WhatsApp a ${esc(ev.branch)}</a>`);
        if (ev.track && okTrack(ev.track)) parts.push(`<a class="btn btn--accent btn--block" href="${esc(ev.track)}">📍 Seguí tu pedido</a>`);
        card("ccardx--ok", parts.join(""));
        if (ev.entry) { saveHistory(ev.entry); }
        setCart({}, { silent: true });
      }
      else if (ev.type === "track" && okTrack(ev.url)) card("", `<a class="btn btn--accent btn--block" href="${esc(ev.url)}">📍 Seguí tu pedido ${esc(ev.code || "")}</a>`);
      else if (ev.type === "handoff" && okWa(ev.url)) card("", `<a class="btn btn--whatsapp btn--block" href="${esc(ev.url)}" target="_blank" rel="noopener">${icon("i-wa")}Hablar con una persona · ${esc(ev.to || "")}</a>`);
      else if (ev.type === "state" && ev.state) { const { history: _h, ...rest } = ev.state; aiState = rest; persist(); }
      else if (ev.type === "error") aiErr(ev.kind);
    }
    if (botText) { msgs.push({ role: "assistant", content: botText }); speak(botText); } else if (!gotAny) msgs.pop();
    else setVoice(null);
    persist();
  }
  function shareLocation(c) {
    if (!navigator.geolocation) { c.innerHTML = "Tu navegador no comparte ubicación. Escribí la dirección 🙏"; return; }
    c.innerHTML = "Buscando tu ubicación…";
    navigator.geolocation.getCurrentPosition((p) => {
      aiState.order = { ...(aiState.order || {}), location: { lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6) } }; persist();
      c.innerHTML = "📍 Ubicación compartida"; send("📍 Ubicación compartida");
    }, () => { c.innerHTML = "No pude obtener tu ubicación. Escribí la dirección 🙏"; }, { enableHighAccuracy: true, timeout: 10000 });
  }

  // ---------- voice (Web Speech API) ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const mic = $("#mic"), vstatus = $("#vstatus"), hf = $("#handsfree");
  let rec = null, listening = false, wake = null, voiceMode = false;
  if (SR) { mic.hidden = false; $("#hfwrap").hidden = false; } else { vstatus.textContent = "Escribí tu pedido"; }
  function setVoice(state) {
    const labels = { listening: "Escuchando…", thinking: "Pensando…", speaking: "Hablando… tocá para interrumpir" };
    mic.dataset.state = state || "idle"; vstatus.textContent = labels[state] || (SR ? "Tocá el micrófono y hablá" : "Escribí tu pedido");
  }
  function pickVoice() { const vs = speechSynthesis.getVoices(); return vs.find((v) => /es[-_]BO/i.test(v.lang)) || vs.find((v) => /es[-_](419|US|MX|AR)/i.test(v.lang)) || vs.find((v) => /^es/i.test(v.lang)); }
  function cleanSpeech(t) { return t.replace(/https?:\/\/\S+/g, "").replace(/\*\*/g, "").replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").replace(/Bs\.?\s?(\d+(?:[.,]\d+)?)/g, "$1 bolivianos").replace(/\s+/g, " ").trim(); }
  function speak(text) {
    if (!voiceMode || !("speechSynthesis" in window)) { setVoice(null); return; }
    const u = new SpeechSynthesisUtterance(cleanSpeech(text)); const v = pickVoice(); if (v) u.voice = v; u.lang = v ? v.lang : "es-BO"; u.rate = 1.05;
    u.onend = () => { setVoice(null); if (hf.checked && chat.classList.contains("is-open")) listen(); };
    setVoice("speaking"); speechSynthesis.cancel(); speechSynthesis.speak(u);
  }
  async function lockScreen() { try { if ("wakeLock" in navigator && !wake) wake = await navigator.wakeLock.request("screen"); } catch { /* not allowed */ } }
  function listen() {
    if (!SR) return;
    if ("speechSynthesis" in window) speechSynthesis.cancel(); // barge-in
    voiceMode = true; lockScreen();
    rec = new SR(); rec.lang = "es-BO"; rec.interimResults = true; rec.maxAlternatives = 1;
    let finalText = "";
    rec.onresult = (e) => { let t = ""; for (const r of e.results) { t += r[0].transcript; if (r.isFinal) finalText = t; } input.value = t; };
    rec.onerror = (e) => { listening = false; setVoice(null); if (e.error === "not-allowed" || e.error === "service-not-allowed") { vstatus.textContent = "Sin permiso de micrófono: escribí tu pedido 🙂"; voiceMode = false; } else if (e.error === "language-not-supported") { rec.lang = "es-419"; } };
    rec.onend = () => { listening = false; const t = (finalText || input.value).trim(); input.value = ""; if (t) send(t, { voice: true }); else setVoice(null); };
    listening = true; setVoice("listening"); try { rec.start(); } catch { listening = false; setVoice(null); }
  }
  function stopVoice() { try { rec && rec.abort(); } catch { /* */ } if ("speechSynthesis" in window) speechSynthesis.cancel(); listening = false; setVoice(null); if (wake) { wake.release().catch(() => {}); wake = null; } }
  mic.addEventListener("click", () => { if (mic.dataset.state === "speaking") { speechSynthesis.cancel(); listen(); return; } if (listening) { rec.stop(); return; } listen(); });
  if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => {};

  // ---------- floating bars ----------
  const funnelEl = $("#pedir"), ftr = $("#ftr");
  const vis = { hero: true, funnel: false, footer: false };
  const vio = new IntersectionObserver((ens) => { ens.forEach((en) => { if (en.target === hero) vis.hero = en.isIntersecting; if (en.target === funnelEl) vis.funnel = en.isIntersecting; if (en.target === ftr) vis.footer = en.isIntersecting; }); updateBars(); }, { threshold: 0.05 });
  [hero, funnelEl, ftr].forEach((el) => vio.observe(el));
  function updateBars() {
    const overlay = chat.classList.contains("is-open") || $("#drawer").classList.contains("is-open");
    $("#mbar").classList.toggle("is-hidden", vis.hero || vis.funnel || vis.footer || overlay);
    $("#aifab").classList.toggle("is-hidden", vis.footer || overlay);
  }

  // ---------- reveal ----------
  function reveal() {
    if (RM || !("IntersectionObserver" in window)) { $$(".reveal").forEach((r) => r.classList.add("is-in")); return; }
    const io = new IntersectionObserver((ens) => ens.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } }), { threshold: 0.12 });
    $$(".reveal:not(.is-in)").forEach((r) => io.observe(r));
  }

  // ---------- boot ----------
  renderTicker(); renderBranches(); renderWeekly(); renderSpecial(); renderMenu(); renderCombos(); renderPicker(""); renderCartUI(false); watchVideos(); reveal(); onScroll();
  setInterval(() => { renderBranches(); }, 60000);
  if (location.hash === "#asistente") openChat();
})();
