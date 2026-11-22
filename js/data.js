/*
 * Pollos Campeón · single source of truth for the website, Campe-IA's tools AND the database seed.
 * The site, the assistant and scripts/seed-sql.js all read the same catalog() with the same ids.
 * Nothing here is invented: every fact carries its public source. What isn't public (hours,
 * most branch WhatsApps, delivery fee, drink prices…) is left out and listed in README.md.
 *
 * Sources:
 *   IG  = https://www.instagram.com/polloscampeon.oficial/   (bio, posts; shortcodes below)
 *   WEB = https://polloscampeon.com/menu/ and /locales/       (menu prices "venta en local", branches)
 *   LT  = https://linktr.ee/polloscampeon                     (slogan, delivery WhatsApps)
 *   FB  = https://www.facebook.com/PollosChampion/            (followers, Luján opening)
 */
(function (root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.CAMPEON = data;
})(typeof self !== "undefined" ? self : this, function () {
  const IG = (c) => `https://www.instagram.com/p/${c}/`;

  const CAMPEON = {
    config: {
      brand: "Pollos Campeón",
      ai: "Campe-IA",
      slug: "campeia",
      codePrefix: "PC",
      slogan: "El pollo #1 de Bolivia",          // LT bio
      since: 1981,                               // IG bio "Tradición desde 1981"
      years: 45,                                 // IG DdLFSfhuiab "45 años de historia"
      callCenter: "59179888975",                 // LT "Delivery Pollos Campeón" wa.me/59179888975; IG "Pedidos al 798-88975"
      customerService: "59179899998",            // WEB /locales/ "Atención al cliente 7989-9998"
      instagram: "https://www.instagram.com/polloscampeon.oficial/",
      facebook: "https://www.facebook.com/PollosChampion",
      linktree: "https://linktr.ee/polloscampeon",
      website: "https://polloscampeon.com/",
      timezone: "America/La_Paz",
      currency: "Bs",
      currencyWords: "bolivianos",
      locale: "es-BO",
      phonePrefix: "591",
      phoneDigits: 8,
      city: "Santa Cruz de la Sierra",
      country: "Bolivia",
      emoji: "🍗",
    },

    stats: [
      { value: 45, suffix: " años", label: "de tradición, desde 1981" },   // IG bio + IG DdLFSfhuiab
      { value: 16, suffix: "", label: "sucursales en Santa Cruz" },        // WEB /locales/ (15) + FB Luján opening
      { value: 112, suffix: "K", label: "campeones en Facebook" },          // FB "112393 followers"
    ],

    base: "Cada plato de pollo a la brasa de los combos viene servido con arroz, papas fritas y plátano frito", // IG combo photos (DfPq5S2B-Gk…): plate shows rice, fries, fried plantain
    priceNote: "Precios de venta en local.",   // WEB /menu/

    sizes: null, // pollo is sold by piece (cuarto pierna / pecho / entero), no size coins

    // WEB /menu/ — prices exactly as published
    menu: [
      {
        id: "pollos", name: "Pollos", size: "brasa · broaster",
        items: [
          { id: "pierna-brasa", name: "Cuarto Pierna a la Brasa", price: 37, img: "assets/img/p-pierna-brasa.webp", desc: "Cuarto de pollo a la brasa, pierna." },
          { id: "pecho-brasa", name: "Cuarto Pecho a la Brasa", price: 39, img: "assets/img/p-pecho-brasa.webp", desc: "Cuarto de pollo a la brasa, pecho." },
          { id: "broaster-pierna", name: "Broaster Pierna", price: 37, img: "assets/img/p-pierna-broaster.webp", desc: "Pierna de pollo broaster, crocante." },
          { id: "pipocas", name: "Pipocas de Pollo con Papas", price: 32, img: "assets/img/cut-pipocas.webp", desc: "Pipocas de pollo acompañadas de papas fritas.", hot: true },
          { id: "combo-pipoca", name: "Combo Pipoca", price: 35, img: "assets/img/cut-combo-pipoca.webp", desc: "Pipocas de pollo con papas + soda de 300 ml." },
          { id: "entero", name: "Pollo Entero sin Guarnición", price: 125, img: "assets/img/p-pollo-entero.webp", desc: "Pollo entero a la brasa, solo." },
          { id: "entero-guarniciones", name: "Pollo Entero con Guarniciones", price: 144, img: "assets/img/p-pollo-entero-guarniciones.webp", desc: "Pollo entero a la brasa con guarniciones, para compartir." },
        ],
      },
      {
        id: "pastas", name: "Pastas", size: "lasañas",
        items: [
          { id: "lasana-carne", name: "Lasaña de Carne", price: 38, img: "assets/img/cut-lasana.webp", desc: "Lasaña de carne." },
          { id: "lasana-pollo", name: "Lasaña de Pollo", price: 38, desc: "Lasaña de pollo. No disponible en Ventura Mall.", excl: ["ventura"] }, // WEB "*Lasaña no válida en Ventura Mall."
        ],
      },
      {
        id: "ensaladas", name: "Ensaladas", size: "frescas",
        items: [
          { id: "cesar", name: "Ensalada César", price: 34, img: "assets/img/p-ensalada-cesar.webp", desc: "Ensalada César." },
        ],
      },
    ],

    // WEB /menu/ "Guarniciones" + "Salsas"
    addons: [
      { id: "guarniciones", name: "Guarniciones", items: [
        { id: "papas", name: "Papas fritas", price: 12, img: "assets/img/p-papas-fritas.webp" },
        { id: "platanos", name: "Porción de plátanos", price: 12, img: "assets/img/p-porcion-platanos.webp" },
        { id: "arroz", name: "Porción de arroz", price: 12, img: "assets/img/p-porcion-arroz.webp" },
      ] },
      { id: "salsas", name: "Salsas", items: [
        { id: "aji", name: "Ají", price: 1, img: "assets/img/cut-aji.webp" },
      ] },
    ],

    // Loose sodas are not priced anywhere public → none listed (README "needs owner input").
    drinks: [],

    // IG "Combos de noviembre" (DfNEoWkhhsT) + one post per day. Every post says
    // "Válido para mesa, para llevar y delivery. No incluye Luján." (Dupla: "Solo por Yango").
    weeklyNote: "Válido para mesa, para llevar y delivery. No incluye Luján.",
    weeklyUntil: "2026-11-30", // posts say "los <día> de noviembre"
    weekly: [
      { day: 1, id: "combo-trio", name: "Lunes", title: "Combo Trío", price: 95, img: "assets/img/promo-trio.webp", url: IG("DfPq5S2B-Gk"),
        desc: "2 cuartos (pecho y pierna) + 1 pipoca + 1 soda de 2 litros.", cats: ["pollos"] },
      { day: 2, id: "combo-ejecutivo", name: "Martes", title: "Combo Ejecutivo", price: 130, img: "assets/img/promo-ejecutivo.webp", url: IG("DfRHDZTO9mU"),
        desc: "4 cuartos de pollo a la brasa (2 pechos + 2 piernas) + 1 soda de 2 litros.", cats: ["pollos"] },
      { day: 3, id: "combo-dupla", name: "Miércoles", title: "Combo Dupla", price: 60, img: "assets/img/promo-dupla.webp", url: IG("DfUfhAnhQLq"),
        desc: "2 cuartos de pollo a la brasa (pecho + pierna).", cats: ["pollos"], channel: "Yango", yangoOnly: true },
      { day: 4, id: "combo-champion", name: "Jueves", title: "Combo Champion", price: 70, img: "assets/img/promo-champion.webp", url: IG("DfWKG3ZO2xu"),
        desc: "2 cuartos (pecho y pierna) + 2 sodas de 500 ml.", cats: ["pollos"] },
    ],

    // Combo cards. parts = closest menu ids (food only: sodas aren't sold loose on the menu),
    // so the deal tools can say what the food costs separately. day = only that weekday.
    combos: [
      { id: "combo-ejecutivo", name: "Combo Ejecutivo", price: 130, img: "assets/img/combo-ejecutivo.webp", day: 2, star: true, share: true,
        note: "4 cuartos a la brasa (2 pechos + 2 piernas) + 1 soda de 2 litros.", drink: "1 soda de 2 litros", parts: ["pecho-brasa", "pecho-brasa", "pierna-brasa", "pierna-brasa"] },
      { id: "combo-trio", name: "Combo Trío", price: 95, img: "assets/img/combo-trio.webp", day: 1,
        note: "2 cuartos (pecho y pierna) + 1 pipoca + 1 soda de 2 litros.", drink: "1 soda de 2 litros", parts: ["pecho-brasa", "pierna-brasa", "pipocas"] },
      { id: "combo-champion", name: "Combo Champion", price: 70, img: "assets/img/combo-champion.webp", day: 4, fav: true,
        note: "2 cuartos (pecho y pierna) + 2 sodas de 500 ml.", drink: "2 sodas de 500 ml", parts: ["pecho-brasa", "pierna-brasa"] },
      { id: "combo-pipoca", name: "Combo Pipoca", price: 35, img: "assets/img/cut-combo-pipoca.webp", menu: true, hot: true,
        note: "Pipocas de pollo con papas + soda de 300 ml.", drink: "1 soda de 300 ml", parts: ["pipocas"] },
    ],

    // Seasonal special — IG DgAoi4nPrvO (reserved by phone with full payment, not sold through the cart)
    special: {
      id: "pack-navideno",
      eyebrow: "Navidad 2026 · cupos limitados",
      name: "Pack Navideño",
      price: 750,
      serves: "Para 8 personas",
      includes: ["1 pollo entero a la brasa", "2 costillas de cerdo", "4 ensaladas con salsas", "Arroz primavera y chaufa", "Exclusiva caja navideña"],
      reserveUntil: "2026-12-20",
      pickup: "Recojo el 24 de diciembre en Av. Cañoto 571.",
      reservePhone: "59179888016",
      terms: "Reserva con el pago total. ¡Cupos limitados!",
      img: "assets/img/pack-navideno.webp",
      url: IG("DgAoi4nPrvO"),
    },

    partner: null, // no partner brand promo found
    jobs: null,    // no job opening posted

    // "Descubrí nuestras promos" row — current promo posts only
    offers: [
      { img: "assets/img/combos-noviembre.webp", href: IG("DfNEoWkhhsT"), alt: "Combos de noviembre de Pollos Campeón" },
      { img: "assets/img/promo-trio.webp", href: IG("DfPq5S2B-Gk"), alt: "Combo Trío, lunes de noviembre, Bs 95" },
      { img: "assets/img/promo-ejecutivo.webp", href: IG("DfRHDZTO9mU"), alt: "Combo Ejecutivo, martes de noviembre, Bs 130" },
      { img: "assets/img/promo-dupla.webp", href: IG("DfUfhAnhQLq"), alt: "Combo Dupla, miércoles de noviembre, Bs 60, solo por Yango" },
      { img: "assets/img/promo-champion.webp", href: IG("DfWKG3ZO2xu"), alt: "Combo Champion, jueves de noviembre, Bs 70" },
      { img: "assets/img/pack-navideno.webp", href: IG("DgAoi4nPrvO"), alt: "Pack Navideño para 8 personas, Bs 750" },
    ],

    featured: [
      { ref: "pierna-brasa", name: "Pollo a la Brasa", tag: "La de siempre", img: "assets/img/pollo-entero-mesa.webp", price: 37, from: true,
        desc: "La receta que nos hizo campeones desde 1981. Pierna Bs 37 · Pecho Bs 39." },
      { ref: "pipocas", name: "Pipocas con Papas", tag: "Crocantes", img: "assets/img/cut-pipocas.webp", price: 32, desc: "Pipocas de pollo con papas fritas." },
      { ref: "lasana-carne", name: "Lasañas", tag: "Pastas", img: "assets/img/lasana.webp", price: 38, desc: "De carne o de pollo. La de pollo no está en Ventura Mall." },
    ],

    // WEB /locales/ addresses + maps. Hours are NOT public → open/close null (README).
    // whatsapp: only Villa 1ro de Mayo has its own (LT 59165060555); the rest use the call centre.
    branches: [
      { id: "canoto", name: "Casco Viejo · Cañoto", num: "1 y 8", address: "Av. Cañoto 571, esquina Junín", maps: "https://g.page/PollosChampion?share", img: "assets/stores/canoto.webp" },
      { id: "sur", name: "Zona Sur", num: "2", address: "Av. Santos Dumont entre 3er anillo externo y 4to anillo", maps: "https://goo.gl/maps/mx1BdYKF5449xHe76" },
      { id: "oeste", name: "Zona Oeste", num: "3", address: "Av. Grigotá, 3er anillo interno", maps: "https://goo.gl/maps/fSdscgH9wES6F1t4A" },
      { id: "norte", name: "Zona Norte", num: "4", address: "Av. Pedro Ribera Méndez (3er anillo interno), entre Av. Banzer y Av. Beni", maps: "https://goo.gl/maps/RauYvv7uhuFo421s6", img: "assets/stores/norte.webp" },
      { id: "villa", name: "Villa 1ro de Mayo", num: "5", address: "Villa 1ro de Mayo, Av. Principal, calle 11", maps: "https://goo.gl/maps/efjAbgVBnMoXGmbs6", whatsapp: "59165060555" },
      { id: "equipetrol", name: "Equipetrol · Fidalga", num: "7", address: "Fidalga Equipetrol, patio de comidas 2do piso. Av. Equipetrol entre 3er y 4to anillo", maps: "https://goo.gl/maps/Ttr5SSWXQj25z5ht7", img: "assets/stores/equipetrol.webp" },
      { id: "ventura", name: "Ventura Mall", num: "10", address: "Av. 4to Anillo Nro. 3, Ventura Mall, patio de comidas piso 2, local 10", maps: "https://g.page/VenturaMallBolivia?share", img: "assets/stores/ventura.webp" },
      { id: "paragua", name: "Paragua", num: "11", address: "Av. Paragua, 4to anillo", maps: "https://maps.app.goo.gl/utpnkbFEdmosK9E99", img: "assets/stores/paragua.webp" },
      { id: "grigota-center", name: "Grigotá Center", num: "12", address: "Av. Grigotá entre 1er y 2do anillo, Edif. Grigotá Center Nro. 2", maps: "https://maps.app.goo.gl/p5NnHeJ4yuChkkvh9", img: "assets/stores/grigota-center.webp" },
      { id: "fidalga-beni", name: "Fidalga Beni", num: "13", address: "Av. Prolongación Beni entre 5to y 6to anillo, Edif. Macro Fidalga", maps: "https://maps.app.goo.gl/G9Aumhy428eXeBZ46", img: "assets/stores/fidalga-beni.webp" },
      { id: "megacenter", name: "MegaCenter", num: "14", address: "Av. El Trompillo, 2do anillo, Edif. MegaCenter, patio de comidas", maps: "https://maps.app.goo.gl/2odmjAyrLbN9YTJE6", img: "assets/stores/megacenter.webp" },
      { id: "makro", name: "Makro Km 6", num: "15", address: "Av. Doble Vía La Guardia km 6", maps: "https://maps.app.goo.gl/wBFW4rpmP2c4sVhu7", img: "assets/stores/makro-km6.webp" },
      { id: "brasil", name: "Avenida Brasil", num: "16", address: "Av. Brasil entre 3er y 4to anillo, Mega Centro Comercial Avenida Brasil, patio de comidas", maps: "https://maps.app.goo.gl/krSKEbY28KkfM5SP8" },
      { id: "km12", name: "Hipermaxi Km 12", num: "17", address: "Av. Doble Vía La Guardia km 12, Edif. Hipermaxi Mi Barrio", maps: "https://maps.app.goo.gl/KQuUk2NyznmnZTBz5", img: "assets/stores/hipermaxi-km12.webp" },
      { id: "biopetrol", name: "Biopetrol", num: "18", address: "Av. Banzer, 7mo anillo al norte", maps: "https://maps.app.goo.gl/bCd4fkMmw3pWBbtu9", img: "assets/stores/biopetrol.webp" },
      // FB "Hoy aperturamos nuestra nueva sucursal en la av. Luján" — exact address not public; weekly combos exclude it (IG)
      { id: "lujan", name: "Luján", address: "Av. Luján", noPromos: true },
    ].map((b) => ({ open: null, close: null, whatsapp: null, ...b })),

    delivery: [
      { name: "WhatsApp Delivery 798-88975", url: "https://wa.me/59179888975" },                       // LT
      { name: "WhatsApp Villa 1ro de Mayo 650-60555", url: "https://wa.me/59165060555" },             // LT
      { name: "Alex Delivery", url: "https://play.google.com/store/apps/details?id=com.dianit.alex" }, // LT
      { name: "PedidosYa", url: "https://www.pedidosya.com.bo/cadenas/pollos-campeon" },              // PedidosYa chain page
      { name: "Yango", url: null },                                                                   // IG Combo Dupla "Solo por Yango"
    ],

    facts: [
      "Pollos Campeón es una cadena de pollo a la brasa y broaster de Santa Cruz de la Sierra, Bolivia, con tradición desde 1981: 45 años en 2026.",
      "Su lema es «El pollo #1 de Bolivia».",
      "La casa matriz está en Av. Cañoto 571, esquina Junín (Casco Viejo).",
      "Pedidos y delivery por WhatsApp al 798-88975. La sucursal Villa 1ro de Mayo tiene su propio WhatsApp: 650-60555. Atención al cliente: 7989-9998.",
      "También se puede pedir por Alex Delivery, PedidosYa y Yango. El Combo Dupla de los miércoles es solo por Yango.",
      "Los precios del menú son de venta en local.",
      "Los combos de noviembre valen para mesa, para llevar y delivery, en todas las sucursales menos Luján. Viernes, sábados y domingos no hay combo del día.",
      "La Lasaña de Pollo no está disponible en Ventura Mall.",
      "El Pack Navideño (Bs 750, para 8 personas) se reserva al 798-88016 con el pago total hasta el 20 de diciembre de 2026, y se recoge el 24 de diciembre en Av. Cañoto 571.",
      "Septiembre es su mes aniversario, junto con el de Santa Cruz.",
      "En noviembre de 2026 atendieron a los jugadores del Abierto Nacional en Mapaizo Golf Club.",
    ],

    story: {
      eyebrow: "Aquí inició todo",                                   // IG DdLFSfhuiab
      title: "45 años de pollo campeón",
      paragraphs: [
        "Sabor que conquista, tradición que nos une: 45 años de historia que une familias de generación en generación.", // IG DdLFSfhuiab
        "Todo empezó en el Casco Viejo, en la esquina de Cañoto y Junín. Hoy el rojo campeón está en todo Santa Cruz, del centro al 7mo anillo.",      // WEB /locales/ (casa matriz) + branch list
      ],
      timeline: [
        { year: "1981", text: "Nace Pollos Campeón en Santa Cruz de la Sierra." },            // IG bio
        { year: "16", text: "sucursales, de Cañoto 571 a Biopetrol y Luján." },               // WEB /locales/ + FB
        { year: "2026", text: "45 años celebrando junto a Santa Cruz cada septiembre." },     // IG DdLFSfhuiab, DcuxvFKOu2j
      ],
      video: "assets/video/historia-45",
      url: IG("DdLFSfhuiab"),
    },

    reels: [
      { src: "assets/video/combos-noviembre", caption: "Los combos de noviembre", url: IG("DfNEoWkhhsT") },
      { src: "assets/video/mision-campeon", caption: "Misión: comer como un Campeón", url: IG("Df9rSfuh9hc") },
      { src: "assets/video/no-lo-dejes-solo", caption: "No lo dejés solo", url: IG("De2fzB5PtNc") },
      { src: "assets/video/del-gym", caption: "Del gym a Campeón", url: IG("DerggiThYf7") },
      { src: "assets/video/version-futuro", caption: "Versión futuro 🏆", url: IG("DemISXuh99F") },
      { src: "assets/video/ventura-sur", caption: "Campeón · Ventura Sur", url: IG("Dfa5-TxBZnu") },
      { src: "assets/video/septiembre", caption: "Septiembre campeón", url: IG("DcuxvFKOu2j") },
    ],

    feed: [
      { img: "assets/img/pack-navideno.webp", url: IG("DgAoi4nPrvO"), alt: "Pack Navideño" },
      { img: "assets/img/mision-campeon.webp", url: IG("Df9rSfuh9hc"), alt: "Misión: comer como un Campeón" },
      { img: "assets/img/abierto-golf.webp", url: IG("Df5KEkyv6i8"), alt: "Abierto Nacional en Mapaizo Golf Club" },
      { img: "assets/img/mal-dia.webp", url: IG("De9mK7fBPo4"), alt: "En caso de un mal día, rompé el vidrio" },
      { img: "assets/img/no-lo-dejes-solo.webp", url: IG("De2fzB5PtNc"), alt: "No lo dejés solo" },
      { img: "assets/img/del-gym.webp", url: IG("DerggiThYf7"), alt: "Del gym a Campeón" },
      { img: "assets/img/santa-cruz-216.webp", url: IG("DdrFFVyO0s-"), alt: "Santa Cruz 216 años" },
      { img: "assets/img/aniversario-45.webp", url: IG("DdLFSfhuiab"), alt: "Pollos Campeón 45 años" },
    ],
  };

  // ---------- derived helpers (pure, shared by browser + Node) ----------
  CAMPEON.catalog = function catalog() {
    const out = {};
    for (const cat of CAMPEON.menu) for (const it of cat.items)
      out[it.id] = { id: it.id, name: it.name, price: it.price, kind: it.id === "combo-pipoca" ? "combo" : "main", cat: cat.id, size: null, desc: it.desc || "", veg: !!it.veg, hot: !!it.hot, img: it.img || null, excl: it.excl || [] };
    for (const g of CAMPEON.addons) for (const it of g.items)
      out[it.id] = { id: it.id, name: it.name, price: it.price, kind: g.id === "salsas" ? "sauce" : "side", cat: g.id, size: null, desc: "", veg: false, hot: false, img: it.img || null, excl: [] };
    for (const d of CAMPEON.drinks) out[d.id] = { id: d.id, name: d.name, price: d.price, kind: "drink", cat: "bebidas", size: d.size || null, desc: "", veg: true, hot: false, img: null, excl: [] };
    for (const c of CAMPEON.combos) {
      if (out[c.id]) { out[c.id].parts = c.parts; out[c.id].drink = c.drink; continue; }
      const w = CAMPEON.weekly.find((x) => x.id === c.id);
      out[c.id] = { id: c.id, name: c.name, price: c.price, kind: "promo", cat: "combos", size: null, desc: c.note, veg: false, hot: !!c.hot, img: c.img,
        day: c.day, until: CAMPEON.weeklyUntil, excl: CAMPEON.branches.filter((b) => b.noPromos).map((b) => b.id), parts: c.parts, drink: c.drink, channelOnly: w && w.yangoOnly ? "yango" : null };
    }
    for (const w of CAMPEON.weekly) if (!out[w.id]) // day promos without a combo card (e.g. Yango-only Dupla)
      out[w.id] = { id: w.id, name: w.title, price: w.price, kind: "promo", cat: "combos", size: null, desc: w.desc, veg: false, hot: false, img: w.img,
        day: w.day, until: CAMPEON.weeklyUntil, excl: CAMPEON.branches.filter((b) => b.noPromos).map((b) => b.id), parts: ["pecho-brasa", "pierna-brasa"].filter(() => w.id === "combo-dupla"), drink: null, channelOnly: w.yangoOnly ? "yango" : null };
    return out;
  };

  CAMPEON.DAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

  // Local wall-clock parts in the restaurant's timezone
  CAMPEON.localNow = function localNow(date) {
    const d = date || new Date();
    const p = new Intl.DateTimeFormat("en-CA", { timeZone: CAMPEON.config.timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" }).formatToParts(d);
    const g = (t) => (p.find((x) => x.type === t) || {}).value;
    const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
    return { ymd: `${g("year")}-${g("month")}-${g("day")}`, hh: +g("hour"), mm: +g("minute"), min: +g("hour") * 60 + +g("minute"), dow };
  };

  // Is a day-promo valid on that local date/day?
  CAMPEON.promoValid = function promoValid(item, now) {
    if (!item || !item.day && item.day !== 0) return true;
    const n = now || CAMPEON.localNow();
    return n.dow === item.day && (!item.until || n.ymd <= item.until);
  };

  CAMPEON.activeWeekly = function activeWeekly(now) {
    const n = now || CAMPEON.localNow();
    return n.ymd <= CAMPEON.weeklyUntil ? CAMPEON.weekly : [];
  };

  // Branch status from "HH:MM" open/close (handles past-midnight). Unknown hours → "unknown".
  CAMPEON.branchStatus = function branchStatus(b, now) {
    const n = now || CAMPEON.localNow();
    if (!b.open || !b.close) return { state: "unknown" };
    const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
    const o = toMin(b.open), c = toMin(b.close), t = n.min;
    const isOpen = c > o ? t >= o && t < c : t >= o || t < c;
    if (isOpen) { const left = ((c - t) + 1440) % 1440; return { state: left <= 30 ? "closing" : "open", closesAt: b.close }; }
    return { state: "closed", opensAt: b.open, today: t < o };
  };

  return CAMPEON;
});
