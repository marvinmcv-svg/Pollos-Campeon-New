/* Pollos Campeón · site logic. Vanilla JS, no build step. All content comes from js/data.js */
(function () {
  "use strict";
  const D = window.CAMPEON;
  if (!D) return;
  const C = D.config;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => `${C.currency} ${Number(n).toLocaleString(C.locale)}`;
  const priceHTML = (n, cls) => `<span class="${cls}"><small>${esc(C.currency)}</small>${esc(n)}</span>`;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(k, s) { try { return JSON.parse((s || localStorage).getItem(k)); } catch (e) { return null; } },
    set(k, v, s) { try { (s || localStorage).setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };
  const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const fmtPhone = (intl) => { const n = String(intl).replace(/^591/, ""); return n.length === 8 ? `${n.slice(0, 3)}-${n.slice(3)}` : n; };

  /* ---------------- time in the shop's timezone ---------------- */
  function nowLocal() {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: C.timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const g = (t) => (p.find((x) => x.type === t) || {}).value;
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
    const h = +g("hour") % 24, m = +g("minute");
    // ?day=0-6 lets QA fake today's promo
    const fake = new URLSearchParams(location.search).get("day");
    return { day: fake !== null && /^[0-6]$/.test(fake) ? +fake : wd, mins: h * 60 + m, hhmm: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, iso: `${g("year")}-${g("month")}-${g("day")}` };
  }
  const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  function branchStatus(b, t) {
    if (!b.open || !b.close) return { cls: "na", label: "Horario por confirmar", open: null };
    const o = toMin(b.open), c = toMin(b.close), m = t.mins;
    const isOpen = c > o ? m >= o && m < c : m >= o || m < c;
    if (isOpen) return c - m > 0 && c - m <= 30 ? { cls: "soon", label: "Cierra pronto", open: true } : { cls: "open", label: "Abierto", open: true };
    if (o - m > 0 && o - m <= 60) return { cls: "soon", label: `Abre ${b.open}`, open: false };
    return { cls: "closed", label: "Cerrado", open: false };
  }
  const todayPromo = (t) => D.weekly.find((w) => w.day === t.day);

  /* ---------------- catalogue ---------------- */
  const CAT = {};
  D.menu.forEach((c) => c.items.forEach((i) => (CAT[i.id] = { name: i.name, price: i.price })));
  Object.values(D.addons).forEach((g) => g.items.forEach((i) => (CAT[i.id] = { name: i.name, price: i.price })));
  D.weekly.forEach((w) => (CAT["promo-" + w.day] = { name: w.title + (w.from ? " (pierna)" : ""), price: w.price }));
  if (D.special) CAT[D.special.id] = { name: D.special.name, price: D.special.price };
  const specialLive = () => D.special && nowLocal().iso <= D.special.reserveUntil;

  /* ---------------- cart ---------------- */
  let cart = store.get("campeon.cart") || {};
  Object.keys(cart).forEach((k) => { if (!CAT[k] || !(cart[k] > 0)) delete cart[k]; });
  const cartLines = () => Object.entries(cart).map(([id, q]) => ({ id, q, ...CAT[id] }));
  const cartCount = () => Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = () => cartLines().reduce((a, l) => a + l.q * l.price, 0);
  function setQty(id, q) {
    if (q <= 0) delete cart[id]; else cart[id] = Math.min(q, 99);
    store.set("campeon.cart", cart);
    renderCart();
  }
  function add(id) {
    if (!CAT[id]) return;
    setQty(id, (cart[id] || 0) + 1);
    toast(`Agregado: <b>${esc(CAT[id].name)}</b>`);
    const b = $("#cartCount"); b.classList.remove("bump"); void b.offsetWidth; b.classList.add("bump");
  }
  const lineHTML = (l) => `<div class="line-item"><span class="line-item__n">${esc(l.name)}</span>
      <span class="qty"><button type="button" data-q="${esc(l.id)}" data-d="-1" aria-label="Quitar uno de ${esc(l.name)}">−</button><span>${l.q}</span><button type="button" data-q="${esc(l.id)}" data-d="1" aria-label="Agregar uno de ${esc(l.name)}">+</button></span>
      <span class="line-item__p">${esc(money(l.q * l.price))}</span></div>`;
  function renderCart() {
    const n = cartCount(), tot = cartTotal(), lines = cartLines();
    $("#cartCount").textContent = n;
    $("#mbarCount").textContent = n; $("#mbarTotal").textContent = money(tot);
    $("#mbarCart").hidden = n === 0;
    $("#drawerTotal").textContent = money(tot);
    $("#drawerFoot").hidden = n === 0;
    $("#drawerBody").innerHTML = n ? lines.map(lineHTML).join("") :
      `<div class="drawer__empty"><img src="/assets/img/logo.png" width="96" height="96" alt="" /><p>Tu bandeja está vacía… y tu panza también 🍗</p><a class="btn btn--red" href="#combos" data-close-drawer>Ver combos</a></div>`;
    $("#fCart").innerHTML = n ? lines.map(lineHTML).join("") + `<div class="line-item"><b class="line-item__n">Total</b><b class="line-item__p">${esc(money(tot))}</b></div>` :
      `<p class="f-cart__empty">Todavía no agregaste nada. Elegí abajo 👇</p>`;
    updatePreview();
  }
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-add]"); if (a) { e.preventDefault(); add(a.dataset.add); return; }
    const q = e.target.closest("[data-q]"); if (q) { setQty(q.dataset.q, (cart[q.dataset.q] || 0) + +q.dataset.d); return; }
    const i = e.target.closest("[data-intent]"); if (i) setIntent(i.dataset.intent);
    if (e.target.closest("[data-close-drawer]")) closeDrawer();
    if (e.target.closest("[data-campeia-open]")) { e.preventDefault(); openChat(); }
  });

  /* ---------------- toast ---------------- */
  let toastT;
  function toast(html) { const t = $("#toast"); t.innerHTML = html; t.classList.add("is-on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("is-on"), 2200); }

  /* ---------------- hero: stats, live pill ---------------- */
  $("#stats").innerHTML = D.stats.map((s) => `<li><b data-count="${s.value}" data-suffix="${esc(s.suffix)}" data-dec="${s.decimals || 0}">${esc(s.value + s.suffix)}</b><span>${esc(s.label)}</span></li>`).join("");
  function countUp() {
    if (reduced) return;
    $$("[data-count]").forEach((el) => {
      const end = +el.dataset.count, dec = +el.dataset.dec, suf = el.dataset.suffix, t0 = performance.now(), dur = 1600;
      const step = (t) => { const k = Math.min(1, (t - t0) / dur), v = end * (1 - Math.pow(1 - k, 3)); el.textContent = v.toFixed(dec) + suf; if (k < 1) requestAnimationFrame(step); };
      el.textContent = (0).toFixed(dec) + suf; setTimeout(() => requestAnimationFrame(step), 500);
    });
  }
  function renderLive() {
    const t = nowLocal(), st = D.branches.map((b) => branchStatus(b, t));
    const known = st.filter((s) => s.open !== null), openN = st.filter((s) => s.open).length;
    const p = todayPromo(t);
    const promo = p ? `Hoy: <b>${esc(p.title)}</b> ${esc(money(p.price))}` : specialLive() ? `Reservá el <b>Pack Navideño</b>` : `Hoy: menú campeón completo`;
    let head;
    if (!known.length) head = `${D.branches.length} sucursales en Santa Cruz`;
    else if (openN) head = `<b>${openN}</b> de ${D.branches.length} sucursales abiertas`;
    else {
      const opens = D.branches.filter((b) => b.open).map((b) => toMin(b.open)).sort((a, b) => a - b)[0];
      const hh = `${String(Math.floor(opens / 60)).padStart(2, "0")}:${String(opens % 60).padStart(2, "0")}`;
      head = t.mins < opens ? `Abrimos hoy a las ${hh}` : `Volvemos mañana desde las ${hh}`;
    }
    $("#liveText").innerHTML = `${head} · ${promo}`;
    $("#clock").innerHTML = known.length ? `${t.hhmm} en Santa Cruz · <b>${openN} de ${D.branches.length}</b> abiertas` : `${t.hhmm} en Santa Cruz · <b>${D.branches.length}</b> sucursales`;
  }

  /* ---------------- marquee ---------------- */
  const mq = [...D.weekly.map((w) => w.title), D.special && D.special.name, "Pollo a la brasa", "Broaster", "Pipocas", "Tradición desde 1981"].filter(Boolean);
  const mqHTML = mq.map((x) => `<span>${esc(x)}</span><span><i>✦</i></span>`).join("");
  $("#marquee").innerHTML = mqHTML + mqHTML;

  /* ---------------- weekly promos ---------------- */
  $("#weeklyNote").textContent = D.weeklyNote;
  function renderWeek() {
    const t = nowLocal();
    const cards = D.weekly.map((w) => {
      const today = w.day === t.day;
      return `<article class="day day--${esc(w.color)} reveal${today ? " is-today" : ""}">
        ${today ? `<span class="day__today">Hoy</span>` : ""}${w.tag ? `<span class="pill day__tag">${esc(w.tag)}</span>` : ""}
        <p class="day__name">${esc(w.name)}</p><h3 class="day__title">${esc(w.title)}</h3><p class="day__desc">${esc(w.desc)}</p>
        <div class="day__foot"><span class="price">${w.from ? "<em>desde</em>" : ""}<small>${esc(C.currency)}</small>${esc(w.price)}</span>
        <button class="add${today ? " add--cream" : ""}" type="button" data-add="promo-${w.day}" aria-label="Agregar ${esc(w.title)}">+</button></div></article>`;
    });
    const wk = t.day === 0 || t.day === 6;
    cards.push(`<article class="day day--weekend reveal${wk ? " is-today" : ""}" style="${wk ? "background:var(--wine);color:var(--cream)" : ""}">
      ${wk ? `<span class="day__today">Hoy</span>` : ""}<p class="day__name">Sábado y domingo</p><h3 class="day__title">Finde campeón</h3>
      <p class="day__desc">Sin promo del día, pero con todo el menú: pollo a la brasa, broaster, pipocas y lasañas.${specialLive() ? " Y el Pack Navideño para reservar." : ""}</p>
      <div class="day__foot"><a class="btn btn--mustard" href="#menu">Ver el menú</a></div></article>`);
    $("#week").innerHTML = cards.join("");
    observe($$("#week .reveal"));
  }
  const calBox = $("#calBox");
  $("#calBtn").addEventListener("click", () => { const im = $("img", calBox); if (!im.src) im.src = im.dataset.src; calBox.hidden = false; $(".lightbox__x", calBox).focus(); });
  calBox.addEventListener("click", (e) => { if (e.target === calBox || e.target.closest(".lightbox__x")) { calBox.hidden = true; $("#calBtn").focus(); } });

  /* ---------------- special ---------------- */
  if (specialLive()) {
    const s = D.special;
    const until = new Date(s.reserveUntil + "T12:00:00").toLocaleDateString(C.locale, { day: "numeric", month: "long" });
    $("#especial").hidden = false;
    $("#special").innerHTML = `
      <div class="giftbox reveal" role="img" aria-label="Pack Navideño de Pollos Campeón">
        <span class="giftbox__tag">🎄 ${esc(s.serves)}</span>
        <p class="giftbox__big">Pack<span>Navideño</span></p>
      </div>
      <div class="special__txt reveal">
        <p class="eyebrow eyebrow--mustard">${esc(s.eyebrow)}</p>
        <h2 class="display display--cream">${esc(s.name)}</h2>
        <p class="special__lede">La Navidad se celebra en la mesa, y la mesa se arma con Campeón. ${esc(s.serves)}:</p>
        <ul class="checks">${s.includes.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
        <p class="special__price"><small>${esc(C.currency)}</small>${esc(s.price)}</p>
        <p class="special__meta">Reservas hasta el ${esc(until)} · ${esc(s.pickup)} ${esc(s.terms)}</p>
        <div class="special__ctas">
          <a class="btn btn--mustard btn--lg" href="https://wa.me/${esc(s.reservePhone)}?text=${encodeURIComponent("¡Hola Pollos Campeón! 🎄 Quiero reservar el Pack Navideño (Bs " + s.price + ").")}" target="_blank" rel="noopener">Reservar al ${esc(fmtPhone(s.reservePhone))} →</a>
          <button class="btn btn--ghost btn--lg" type="button" data-add="${esc(s.id)}">Agregar al pedido</button>
        </div>
      </div>`;
  }

  /* ---------------- menu ---------------- */
  $("#priceNote").textContent = D.priceNote;
  let curCat = D.menu[0].id, menuExpanded = false;
  const mobile = () => matchMedia("(max-width: 760px)").matches;
  function renderTabs(el, cur, onPick, dark) {
    el.innerHTML = D.menu.map((c) => `<button class="tab" role="tab" type="button" data-cat="${esc(c.id)}" aria-selected="${c.id === cur}">${esc(c.name)} <small>${esc(c.size)}</small></button>`).join("") +
      (dark ? `<button class="tab" role="tab" type="button" data-cat="addons" aria-selected="${cur === "addons"}">Guarniciones <small>y ají</small></button>` : "");
    el.onclick = (e) => { const b = e.target.closest("[data-cat]"); if (b) onPick(b.dataset.cat); };
  }
  function renderMenu() {
    renderTabs($("#menuTabs"), curCat, (id) => { curCat = id; menuExpanded = false; renderMenu(); });
    const cat = D.menu.find((c) => c.id === curCat);
    const limit = mobile() && !menuExpanded ? 6 : Infinity;
    const list = $("#menuList");
    list.style.animation = "none"; void list.offsetWidth; list.style.animation = "";
    list.innerHTML = cat.items.slice(0, limit).map((i) => `<div class="item">
        ${i.img ? `<img class="item__img" src="${esc(i.img)}" width="92" height="69" loading="lazy" alt="${esc(i.name)}" />` : `<span class="item__ph" aria-hidden="true">${esc(i.name.split(" ").pop()[0])}</span>`}
        <div class="item__body"><h3 class="item__name">${esc(i.name)}${i.hot ? `<span class="tag">Favorito</span>` : ""}${i.star ? `<span class="tag tag--blue">Para compartir</span>` : ""}</h3><p class="item__desc">${esc(i.desc)}</p></div>
        ${priceHTML(i.price, "item__price")}
        <button class="add" type="button" data-add="${esc(i.id)}" aria-label="Agregar ${esc(i.name)}">+</button></div>`).join("");
    const more = $("#menuMore");
    more.hidden = !(cat.items.length > limit);
    more.textContent = `Ver los ${cat.items.length} ↓`;
  }
  $("#menuMore").addEventListener("click", () => { menuExpanded = true; renderMenu(); });
  addEventListener("resize", debounce(renderMenu, 200));
  function renderAddons() {
    const g = D.addons.guarniciones, s = D.addons.salsas.items[0];
    $("#addons").innerHTML = `<div class="addon reveal"><h3>${esc(g.title)}</h3><div class="addon__row">${g.items.map((i) => `
        <button class="side" type="button" data-add="${esc(i.id)}" aria-label="Agregar ${esc(i.name)}, ${esc(money(i.price))}">
          <img src="${esc(i.img)}" width="720" height="540" loading="lazy" alt="" /><b>${esc(i.name)}</b><span>${esc(money(i.price))} +</span></button>`).join("")}</div></div>
      <div class="addon addon--aji reveal"><h3>${esc(s.name)}</h3><img src="${esc(s.img)}" width="900" height="768" loading="lazy" alt="Sobres de ají de Pollos Campeón" />
        <p>Nuestro ají, para el que le gusta con picante.</p>
        <button class="btn btn--mustard" type="button" data-add="${esc(s.id)}">Agregar ají · ${esc(money(s.price))}</button></div>`;
  }

  /* ---------------- combos + featured ---------------- */
  function renderCombos() {
    $("#combosGrid").innerHTML = D.combos.map((c) => `<article class="combo reveal${c.star ? " combo--star" : ""}">
        <div class="combo__media${c.cut ? " combo__media--cut" : ""}"><img src="${esc(c.img)}" width="720" height="540" loading="lazy" alt="${esc(c.name)}" />
          ${c.hot ? `<span class="combo__badge">Favorito</span>` : c.star ? `<span class="combo__badge combo__badge--star">Para compartir</span>` : ""}</div>
        <div class="combo__body"><h3 class="combo__name">${esc(c.name)}</h3><p class="combo__note">${esc(c.note)}</p>
          <div class="combo__foot">${priceHTML(c.price, "combo__price")}<button class="add add--cream" type="button" data-add="${esc(c.id)}" aria-label="Agregar ${esc(c.name)}">+</button></div></div></article>`).join("");
    $("#featGrid").innerHTML = D.featured.map((f) => `<article class="fcard reveal">
        <div class="fcard__media"><img src="${esc(f.img)}" width="1400" height="700" loading="lazy" alt="${esc(f.name)}" /></div>
        <span class="fcard__tag">${esc(f.tag)}</span>
        <div class="fcard__body"><h3 class="fcard__name">${esc(f.name)}</h3><p class="fcard__desc">${esc(f.desc)}</p>
          <div class="fcard__foot"><span class="fcard__price">${f.from ? '<small>desde</small>' : ""}<small>${esc(C.currency)}</small>${esc(f.price)}</span>
          <button class="add" type="button" data-add="${esc(f.ref)}" aria-label="Agregar ${esc(f.name)}">+</button></div></div></article>`).join("");
    $("#combosFine").textContent = `${D.priceNote} Fotos reales de nuestros productos.`;
  }

  /* ---------------- locales rail ---------------- */
  function renderRail() {
    const byId = Object.fromEntries(D.branches.map((b) => [b.id, b]));
    $("#rail").innerHTML = D.gallery.map((g) => {
      const b = g.ref && byId[g.ref];
      const inner = `<img src="${esc(g.img)}" width="1000" height="667" loading="lazy" alt="${esc(g.caption)}" /><span class="slide__cap"><b>${esc(g.caption)}</b>${b ? `<small>Cómo llegar ↗</small>` : ""}</span>`;
      return b ? `<a class="slide" href="${esc(b.maps)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="slide">${inner}</div>`;
    }).join("");
    const rail = $("#rail"), step = () => ($(".slide", rail) || { offsetWidth: 300 }).offsetWidth + 18;
    $("#railPrev").onclick = () => rail.scrollBy({ left: -step(), behavior: reduced ? "auto" : "smooth" });
    $("#railNext").onclick = () => rail.scrollBy({ left: step(), behavior: reduced ? "auto" : "smooth" });
  }

  /* ---------------- branches ---------------- */
  function renderBranches() {
    const t = nowLocal();
    $("#branches").innerHTML = D.branches.map((b) => {
      const s = branchStatus(b, t), wa = b.whatsapp;
      return `<article class="branch reveal is-in">
        <div class="branch__media${b.img ? "" : " branch__media--none"}">${b.img ? `<img src="${esc(b.img)}" width="1000" height="667" loading="lazy" alt="Sucursal ${esc(b.name)}" />` : `<span>${esc(b.name)}</span>`}
          <span class="branch__num">${b.hq ? "Casa matriz · " : ""}Sucursal ${esc(b.num)}</span></div>
        <div class="branch__body">
          <div class="branch__top"><h3 class="branch__name">${esc(b.name)}</h3><span class="status status--${s.cls}">${esc(s.label)}</span></div>
          <p class="branch__addr">${esc(b.address)}</p>
          ${b.open ? `<p class="branch__hours">${esc(b.open)} – ${esc(b.close)}</p>` : ""}
          <div class="branch__links"><a href="${esc(b.maps)}" target="_blank" rel="noopener">Cómo llegar ↗</a>
          ${wa ? `<a class="wa" href="https://wa.me/${esc(wa)}" target="_blank" rel="noopener">WhatsApp ${esc(fmtPhone(wa))}</a>` : ""}</div>
        </div></article>`;
    }).join("");
    $("#delivList").innerHTML = D.delivery.map((d) => `<li>${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a>` : `<span>${esc(d.name)}</span>`}</li>`).join("");
  }

  /* ---------------- instagram posts ---------------- */
  function renderPosts() {
    $("#posts").innerHTML = D.posts.map((p) => {
      const d = new Date(p.date + "T12:00:00").toLocaleDateString(C.locale, { day: "numeric", month: "short" });
      return `<a class="post post--${esc(p.color)} reveal" href="${esc(p.url)}" target="_blank" rel="noopener">
        <span class="post__ig"><img src="/assets/img/logo.png" width="26" height="26" alt="" /> polloscampeon.oficial</span>
        <p class="post__txt">${esc(p.text)}</p><span class="post__foot"><span>${esc(d)}</span><span>Ver en Instagram ↗</span></span></a>`;
    }).join("");
  }

  /* ---------------- funnel ---------------- */
  const F = { step: 1, intent: "delivery", when: "asap", ev: "", topic: "", fcat: D.menu[0].id };
  const form = $("#funnel");
  function setIntent(v) {
    const r = $(`input[name="intent"][value="${v}"]`, form); if (r) r.checked = true;
    F.intent = v; syncIntent();
    if (v !== "question") goStep(cartCount() && (v === "delivery" || v === "pickup") ? 2 : 1, true);
  }
  form.addEventListener("change", (e) => { if (e.target.name === "intent") { F.intent = e.target.value; syncIntent(); } });
  function syncIntent() {
    const order = F.intent === "delivery" || F.intent === "pickup";
    $$("[data-for]", form).forEach((el) => {
      const k = el.dataset.for;
      el.hidden = k === "order" ? !order : k === "delivery" ? F.intent !== "delivery" : k === "when" ? !order : k !== F.intent;
    });
    updatePreview();
  }
  function renderBranchSelect() {
    const t = nowLocal(), cur = $("#fBranch").value;
    $("#fBranch").innerHTML = `<option value="">Elegí tu sucursal…</option>` + D.branches.map((b) => {
      const s = branchStatus(b, t); return `<option value="${esc(b.id)}">${esc(b.name)}${s.open !== null ? ` · ${esc(s.label)}` : ""}</option>`;
    }).join("") + `<option value="central">Central de pedidos · consultas generales</option>`;
    $("#fBranch").value = cur;
  }
  function renderPicker() {
    renderTabs($("#fTabs"), F.fcat, (id) => { F.fcat = id; renderPicker(); }, true);
    const items = F.fcat === "addons" ? Object.values(D.addons).flatMap((g) => g.items) : D.menu.find((c) => c.id === F.fcat).items;
    const extra = F.fcat === D.menu[0].id ? D.weekly.map((w) => ({ id: "promo-" + w.day, name: `${w.title} (${w.name.toLowerCase()})`, price: w.price })) : [];
    $("#fPicker").innerHTML = [...items, ...extra].map((i) => `<button type="button" class="pick" data-add="${esc(i.id)}"><b>${esc(i.name)}</b><span>${esc(money(i.price))} +</span></button>`).join("");
  }
  function chipGroup(sel, key) {
    $(sel).addEventListener("click", (e) => {
      const b = e.target.closest(".chip-btn"); if (!b) return;
      $$(".chip-btn", $(sel)).forEach((x) => x.classList.toggle("is-on", x === b));
      F[key] = b.dataset.v;
      if (key === "when") { $("#fTime").hidden = F.when !== "later"; if (F.when === "later") $("#fTime").focus(); }
      updatePreview();
    });
  }
  chipGroup("#evChips", "ev"); chipGroup("#qChips", "topic"); chipGroup("#whenChips", "when");
  form.addEventListener("input", updatePreview);
  const val = (id) => ($("#" + id).value || "").trim();
  function target() {
    const id = $("#fBranch").value, b = D.branches.find((x) => x.id === id);
    return { branch: b, name: b ? `Pollos Campeón · ${b.name}` : "Pollos Campeón · Pedidos", wa: (b && b.whatsapp) || C.callCenter };
  }
  function message() {
    const tg = target(), L = [];
    if (F.intent === "delivery" || F.intent === "pickup") {
      L.push(`¡Hola Pollos Campeón! 🍗 Quiero hacer un pedido *${F.intent === "delivery" ? "delivery" : "para llevar"}*:`);
      cartLines().forEach((l) => L.push(`• ${l.q} × ${l.name}: ${money(l.q * l.price)}`));
      if (cartCount()) L.push(`*Total: ${money(cartTotal())}*`);
    } else if (F.intent === "event") {
      L.push("¡Hola Pollos Campeón! 🎉 Quiero reservar para una mesa o evento:");
      if (val("evDate") || val("evTime")) L.push(`📅 ${[val("evDate"), val("evTime")].filter(Boolean).join(" · ")}`);
      if (val("evPeople")) L.push(`👥 ${val("evPeople")} personas`);
      if (F.ev) L.push(`🎈 ${F.ev}`);
      if (val("evNote")) L.push(`📝 ${val("evNote")}`);
    } else {
      L.push(`¡Hola Pollos Campeón! 👋 Tengo una consulta${F.topic ? ` sobre *${F.topic}*` : ""}:`);
      if (val("qText")) L.push(val("qText"));
    }
    L.push("");
    if (val("fName")) L.push(`👤 ${val("fName")}`);
    if (tg.branch) L.push(`📍 Sucursal: ${tg.branch.name}`);
    if (F.intent === "delivery") { if (val("fAddr")) L.push(`🏠 ${val("fAddr")}`); if (val("fRef")) L.push(`↪ ${val("fRef")}`); }
    if (F.intent === "delivery" || F.intent === "pickup") L.push(`🕒 ${F.when === "later" ? (val("fTime") ? `Para las ${val("fTime")}` : "Programado") : "Lo antes posible"}`);
    if (val("fNote")) L.push(`💬 ${val("fNote")}`);
    while (L[L.length - 1] === "") L.pop();
    return L.join("\n");
  }
  function updatePreview() {
    if (!form) return;
    const tg = target(), msg = message(), t = nowLocal().hhmm;
    $("#phName").textContent = tg.name; $("#phNum").textContent = "+591 " + fmtPhone(tg.wa);
    const out = $("#phOut");
    out.innerHTML = msg ? esc(msg).replace(/\*([^*\n]+)\*/g, "<b>$1</b>") + `<time>${t}<span class="ticks">✓✓</span></time>` : "";
    $("#phChat").scrollTop = 1e6;
    if (F.step === 4) { $("#summary").innerHTML = esc(msg).replace(/\*([^*\n]+)\*/g, "<b>$1</b>"); $("#sendWa").href = `https://wa.me/${tg.wa}?text=${encodeURIComponent(msg)}`; }
  }
  function validate(step) {
    const order = F.intent === "delivery" || F.intent === "pickup";
    if (step === 2) {
      if (order && !cartCount()) return "Agregá al menos un pollo 🍗";
      if (F.intent === "event" && (!val("evDate") || !val("evPeople"))) return "Contanos la fecha y cuántas personas son 🎉";
      if (F.intent === "question" && !val("qText")) return "Escribí tu consulta ✍️";
    }
    if (step === 3) {
      if (!val("fName")) return "¿A nombre de quién? 🙂";
      if (F.intent === "delivery" && !val("fAddr")) return "Necesitamos tu dirección para el delivery 🏠";
      if (order && F.when === "later" && !val("fTime")) return "Elegí la hora para programar 🕒";
    }
    return "";
  }
  function goStep(n, silent) {
    for (let s = 1; s < n; s++) { const err = validate(s); if (err) { $("#fMsg").textContent = err; n = s; break; } }
    if (n === F.step && $("#fMsg").textContent && !silent) return;
    F.step = n;
    $$(".step", form).forEach((p) => p.classList.toggle("is-on", +p.dataset.panel === n));
    $$("#steps button").forEach((b) => { const k = +b.dataset.step; b.classList.toggle("is-on", k === n); b.classList.toggle("is-done", k < n); });
    $("#fBack").hidden = n === 1; $("#fNext").hidden = n === 4;
    if (n === 2) renderPicker();
    updatePreview();
  }
  $("#fNext").addEventListener("click", () => { const err = validate(F.step); $("#fMsg").textContent = err; if (!err) goStep(F.step + 1); });
  $("#fBack").addEventListener("click", () => { $("#fMsg").textContent = ""; goStep(F.step - 1); });
  $("#steps").addEventListener("click", (e) => { const b = e.target.closest("[data-step]"); if (b) { $("#fMsg").textContent = ""; goStep(+b.dataset.step); } });
  form.addEventListener("input", () => { if ($("#fMsg").textContent && !validate(F.step)) $("#fMsg").textContent = ""; });

  /* ---------------- drawer ---------------- */
  let lastFocus;
  function openDrawer() { lastFocus = document.activeElement; $("#scrim").hidden = false; $("#drawer").hidden = false; $("#drawerClose").focus(); document.body.style.overflow = "hidden"; syncBar(); }
  function closeDrawer() { if ($("#drawer").hidden) return; $("#scrim").hidden = true; $("#drawer").hidden = true; document.body.style.overflow = ""; if (lastFocus) lastFocus.focus(); syncBar(); }
  $("#cartBtn").addEventListener("click", openDrawer);
  $("#mbarCart").addEventListener("click", openDrawer);
  $("#drawerClose").addEventListener("click", closeDrawer);
  $("#scrim").addEventListener("click", closeDrawer);
  $("#drawerGo").addEventListener("click", () => { closeDrawer(); setIntent("delivery"); goStep(2); $("#pedir").scrollIntoView({ behavior: reduced ? "auto" : "smooth" }); });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!calBox.hidden) { calBox.hidden = true; $("#calBtn").focus(); }
    else if (!$("#chat").hidden) closeChat();
    else closeDrawer();
    if (burger.getAttribute("aria-expanded") === "true") toggleNav(false);
  });

  /* ---------------- nav ---------------- */
  const nav = $("#nav"), burger = $("#burger");
  const onScroll = () => nav.classList.toggle("is-scrolled", scrollY > 40);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();
  function toggleNav(open) { burger.setAttribute("aria-expanded", open); $("#navLinks").classList.toggle("is-open", open); }
  burger.addEventListener("click", () => toggleNav(burger.getAttribute("aria-expanded") !== "true"));
  $("#navLinks").addEventListener("click", (e) => { if (e.target.closest("a,button")) toggleNav(false); });

  /* ---------------- fan parallax ---------------- */
  const fan = $("#fan");
  if (!reduced && matchMedia("(pointer: fine)").matches) {
    $(".hero").addEventListener("pointermove", (e) => {
      const r = fan.getBoundingClientRect();
      fan.style.setProperty("--mx", ((e.clientX - r.left - r.width / 2) / r.width).toFixed(3));
      fan.style.setProperty("--my", ((e.clientY - r.top - r.height / 2) / r.height).toFixed(3));
    });
  }

  /* ---------------- reveal ---------------- */
  let io;
  function observe(els) {
    if (reduced || !("IntersectionObserver" in window)) { els.forEach((el) => el.classList.add("is-in")); return; }
    io = io || new IntersectionObserver((ents) => ents.forEach((en) => {
      if (!en.isIntersecting) return;
      const sibs = Array.from(en.target.parentElement.children).filter((x) => x.classList.contains("reveal"));
      en.target.style.transitionDelay = `${Math.max(0, sibs.indexOf(en.target)) % 6 * 70}ms`;
      en.target.classList.add("is-in"); io.unobserve(en.target);
    }), { threshold: .12 });
    els.forEach((el) => io.observe(el));
  }

  /* ---------------- mobile bar visibility ---------------- */
  const hideZones = ["#top", "#pedir", ".foot"].map((s) => $(s));
  const vis = new Set();
  function syncBar() {
    const blocked = vis.size > 0 || !$("#chat").hidden || !$("#drawer").hidden;
    $("#mbar").classList.toggle("is-hidden", blocked);
  }
  if ("IntersectionObserver" in window) {
    const zo = new IntersectionObserver((ents) => { ents.forEach((en) => (en.isIntersecting ? vis.add(en.target) : vis.delete(en.target))); syncBar(); }, { threshold: .25 });
    hideZones.forEach((z) => z && zo.observe(z));
  }

  /* ---------------- Campe-IA chat ---------------- */
  const API = "/api/campeia";
  const chat = $("#chat"), log = $("#chatLog"), input = $("#chatIn");
  let history = (store.get("campeon.chat", sessionStorage) || []).filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-20);
  let busy = false;
  const SUGS = ["¿Cuál es la promo de hoy?", "¿Dónde quedan las sucursales?", "¿Qué trae el Pack Navideño?", "¿Cuánto cuesta el pollo entero?"];
  function md(t) {
    const lines = esc(t).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").split("\n");
    let html = "", inList = false;
    lines.forEach((l) => {
      const m = l.match(/^\s*[-•]\s+(.*)$/);
      if (m) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${m[1]}</li>`; return; }
      if (inList) { html += "</ul>"; inList = false; }
      if (l.trim()) html += `<p>${l}</p>`;
    });
    return html + (inList ? "</ul>" : "");
  }
  function bubble(role, html) { const d = document.createElement("div"); d.className = `msg msg--${role === "user" ? "me" : "bot"}`; d.innerHTML = html; log.appendChild(d); log.scrollTop = 1e6; return d; }
  function renderChat() {
    log.innerHTML = "";
    bubble("assistant", md("¡Hola! Soy **Campe-IA** 🍗, la recepcionista virtual de Pollos Campeón. Preguntame por el menú, las promos o las sucursales."));
    history.forEach((m) => bubble(m.role, m.role === "user" ? esc(m.content) : md(m.content)));
    $("#chatSugs").innerHTML = history.length ? "" : SUGS.map((s) => `<button type="button">${esc(s)}</button>`).join("");
  }
  $("#chatSugs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) send(b.textContent); });
  function openChat() { lastFocus = document.activeElement; if (log.childElementCount === 0) renderChat(); chat.hidden = false; $(".ai-fab").hidden = true; input.focus(); syncBar(); }
  function closeChat() { chat.hidden = true; $(".ai-fab").hidden = false; syncBar(); if (lastFocus) lastFocus.focus(); }
  $("#chatClose").addEventListener("click", closeChat);
  $("#chatForm").addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });
  const LINKS = `<br><a href="#menu" data-close-chat>Ver el menú</a> · <a href="#pedir" data-close-chat>Pedir por WhatsApp</a>`;
  log.addEventListener("click", (e) => { if (e.target.closest("[data-close-chat]")) closeChat(); });
  function errorHTML(status) {
    if ([503, 404, 501, 405].includes(status)) return `Campe-IA se está preparando y muy pronto te va a atender 🛠️.${LINKS}`;
    if (status === 429) return `¡Uy, muchas preguntas seguidas! Esperá un minutito 🙏.${LINKS}`;
    return `Se me cortó la conexión 😅. Probá de nuevo en un ratito.${LINKS}`;
  }
  async function send(text) {
    text = String(text || "").trim().slice(0, 1200);
    if (!text || busy) return;
    busy = true; input.value = ""; $("#chatSugs").innerHTML = "";
    history.push({ role: "user", content: text });
    bubble("user", esc(text));
    const bot = bubble("assistant", `<span class="typing" aria-label="Escribiendo"><i></i><i></i><i></i></span>`);
    let acc = "", failed = 0;
    try {
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", "X-Campeia-Client": "1" }, body: JSON.stringify({ messages: history.slice(-16) }) });
      const soft = +res.headers.get("X-Campeia-Status");
      if (soft) { failed = soft; }
      else if (!res.ok || !res.body) { failed = res.status || 500; }
      else {
        const rd = res.body.getReader(), dec = new TextDecoder();
        for (;;) {
          const { value, done } = await rd.read(); if (done) break;
          acc += dec.decode(value, { stream: true });
          if (acc.includes("[[error]]")) { failed = 500; break; }
          bot.innerHTML = md(acc); log.scrollTop = 1e6;
        }
        if (!failed && !acc.trim()) failed = 500;
      }
    } catch (e) { failed = 500; }
    if (failed) {
      history.pop();
      bot.innerHTML = (acc.replace("[[error]]", "").trim() ? md(acc.replace("[[error]]", "")) + "<br>" : "") + errorHTML(failed);
    } else {
      history.push({ role: "assistant", content: acc.trim() });
    }
    history = history.slice(-20);
    store.set("campeon.chat", history, sessionStorage);
    busy = false; log.scrollTop = 1e6;
  }

  /* ---------------- utils + boot ---------------- */
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
  $("#year").textContent = new Date().getFullYear();
  renderWeek(); renderMenu(); renderAddons(); renderCombos(); renderRail(); renderBranches(); renderPosts();
  renderBranchSelect(); syncIntent(); renderCart(); renderLive(); countUp();
  $("#fBranch").addEventListener("change", updatePreview);
  observe($$(".reveal:not(.is-in)"));
  setInterval(() => { renderLive(); renderBranches(); renderBranchSelect(); }, 60000);
  syncBar();
})();
