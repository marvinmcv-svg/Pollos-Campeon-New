/*
 * Pollos Campeón · single source of truth for the website AND the AI receptionist (Campe-IA).
 * Every fact below carries the public source it came from. Nothing here is invented:
 * if a fact isn't public (hours, most branch WhatsApps, delivery cost…) it is left out
 * and listed in README.md → "Falta confirmar con el dueño".
 *
 * Sources used:
 *   IG  = https://www.instagram.com/polloscampeon.oficial/          (bio, posts)
 *   LT  = https://linktr.ee/polloscampeon                          (slogan, delivery links)
 *   WEB = https://polloscampeon.com/menu/ and /locales/            (menu, prices, branches, photos)
 *   CAL = polloscampeon.com/wp-content/uploads/2026/07/IMG_0723…   (Calendario de promos, julio 2026)
 *   FB  = https://www.facebook.com/PollosChampion/                  (follower count, anniversary month)
 */
(function (root, factory) {
  const data = factory();
  if (typeof module === "object" && module.exports) module.exports = data;
  else root.CAMPEON = data;
})(typeof self !== "undefined" ? self : this, function () {
  const CAMPEON = {
    config: {
      brand: "Pollos Campeón",
      ai: "Campe-IA",
      slogan: "El pollo #1 de Bolivia", // LT bio
      since: 1981,                       // IG bio "Tradición desde 1981"
      callCenter: "59179888975",         // LT "Delivery Pollos Campeón" → wa 59179888975; IG caption "Pedidos al 798-88975"
      customerService: "59179899998",    // WEB /locales/ "Atención al cliente 7989-9998" (phone)
      instagram: "https://www.instagram.com/polloscampeon.oficial/",
      facebook: "https://www.facebook.com/PollosChampion",
      linktree: "https://linktr.ee/polloscampeon",
      website: "https://polloscampeon.com/",
      timezone: "America/La_Paz",
      currency: "Bs",
      locale: "es-BO",
      countryCode: "591",
      city: "Santa Cruz de la Sierra",
    },

    stats: [
      { value: 45, suffix: " años", label: "de tradición, desde 1981" },        // IG bio "Tradición desde 1981"
      { value: 15, suffix: "", label: "sucursales en Santa Cruz" },              // WEB /locales/ (Sucursal 1 y 8 comparten Av. Cañoto 571)
      { value: 112, suffix: "K", label: "campeones en Facebook" },               // FB "112393 followers"
    ],

    priceNote: "Los precios son para venta en local.", // WEB /menu/

    // WEB /menu/ — prices exactly as published (venta en local)
    menu: [
      {
        id: "pollos", name: "Pollos", size: "brasa · broaster",
        items: [
          { id: "pierna-brasa", name: "Pollo a la Brasa · Pierna", price: 37, img: "assets/img/p-pierna-brasa.webp", desc: "Cuarto de pollo a la brasa, pierna." },
          { id: "pecho-brasa", name: "Pollo a la Brasa · Pecho", price: 39, img: "assets/img/p-pecho-brasa.webp", desc: "Cuarto de pollo a la brasa, pecho." },
          { id: "broaster-pierna", name: "Broaster Pierna", price: 37, img: "assets/img/p-pierna-broaster.webp", desc: "Pierna de pollo broaster, crocante." },
          { id: "pipocas", name: "Pipocas de Pollo con Papas", price: 32, img: "assets/img/cut-pipocas.webp", desc: "Pipocas de pollo acompañadas de papas.", hot: true },
          { id: "combo-pipoca", name: "Combo Pipoca", price: 35, img: "assets/img/cut-combo-pipoca.webp", desc: "Pipocas de pollo con papas. Incluye soda 300 ml." },
          { id: "entero", name: "Pollo Entero sin Guarnición", price: 125, img: "assets/img/p-pollo-entero.webp", desc: "Pollo entero, solo." },
          { id: "entero-guarniciones", name: "Pollo Entero con Guarniciones", price: 144, img: "assets/img/p-pollo-entero-guarniciones.webp", desc: "Pollo entero con guarniciones, para compartir.", star: true },
        ],
      },
      {
        id: "pastas", name: "Pastas", size: "lasañas",
        items: [
          { id: "lasana-carne", name: "Lasaña de Carne", price: 38, img: "assets/img/cut-lasana.webp", desc: "Lasaña de carne." },
          { id: "lasana-pollo", name: "Lasaña de Pollo", price: 38, desc: "Lasaña de pollo. No válida en Ventura Mall." }, // WEB "*Lasaña no válida en Ventura Mall."
        ],
      },
      {
        id: "ensaladas", name: "Ensaladas", size: "frescas",
        items: [
          { id: "cesar", name: "Ensalada César", price: 34, img: "assets/img/p-ensalada-cesar.webp", desc: "Ensalada César.", veg: false },
        ],
      },
    ],

    // WEB /menu/ "Guarniciones"
    addons: {
      guarniciones: {
        title: "Guarniciones",
        items: [
          { id: "papas", name: "Papas fritas", price: 12, img: "assets/img/p-papas-fritas.webp" },
          { id: "platanos", name: "Porción de plátanos", price: 12, img: "assets/img/p-porcion-platanos.webp" },
          { id: "arroz", name: "Porción de arroz", price: 12, img: "assets/img/p-porcion-arroz.webp" },
        ],
      },
      salsas: {
        title: "Salsas",
        items: [{ id: "aji", name: "Ají", price: 1, img: "assets/img/cut-aji.webp" }],
      },
    },

    // CAL — "Todos los días de lunes a viernes hay promos". Válido en el local, delivery y para llevar.
    // NOTE: published for julio 2026; owner should confirm it still runs (see README).
    weeklyNote: "Válido en el local, delivery y para llevar.",
    weekly: [
      { day: 1, name: "Lunes", title: "Combo Coca-Cola", desc: "1/4 brasa pierna + 1 Coca-Cola 300 ml (Bs 35) · 1/4 brasa pecho + 1 Coca-Cola 300 ml (Bs 37). De lunes a viernes, hasta agotar stock.", price: 35, from: true, tag: "Yango", color: "red" },
      { day: 2, name: "Martes", title: "Combo Mundial", desc: "4 cuartos de pollo a la brasa (2 pechos, 2 piernas) + 1 soda de 2 litros.", price: 119, color: "blue" },
      { day: 3, name: "Miércoles", title: "Combo Fans", desc: "2/4 de pollo a la brasa + 2 vasos coleccionables Coca-Cola + 2 sodas de 500 ml. Hasta agotar stock.", price: 80, color: "red" },
      { day: 4, name: "Jueves", title: "Combo Champions", desc: "2 cuartos de pollo a la brasa (1 pecho, 1 pierna) + 2 sodas de 500 ml.", price: 66, color: "yellow" },
      { day: 5, name: "Viernes", title: "Combo Triplete", desc: "2 cuartos de pollo a la brasa (1 pecho, 1 pierna) + 1 lasaña de carne o de pollo + 1 soda de 2 litros.", price: 95, color: "orange" },
    ],

    // Seasonal special — IG https://www.instagram.com/p/DgAoi4nPrvO/
    special: {
      id: "pack-navideno",
      eyebrow: "Navidad 2026 · cupos limitados",
      name: "Pack Navideño",
      price: 750,
      serves: "Para 8 personas",
      includes: ["1 pollo entero a la brasa", "2 costillas de cerdo", "4 ensaladas con salsas", "Arroz primavera y chaufa", "Exclusiva caja navideña"],
      reserveUntil: "2026-12-20",
      pickup: "Recojo el 24 de diciembre en Av. Cañoto 571.",
      reservePhone: "59179888016", // "Reserva al 798-88016"
      terms: "Reserva con el pago total. ¡Cupos limitados!",
      url: "https://www.instagram.com/p/DgAoi4nPrvO/",
    },

    // Photographed products from WEB /menu/ (real photo of the exact item)
    combos: [
      { id: "entero-guarniciones", name: "Pollo Entero con Guarniciones", price: 144, img: "assets/img/p-pollo-entero-guarniciones.webp", note: "Pollo entero con guarniciones.", star: true },
      { id: "combo-pipoca", name: "Combo Pipoca", price: 35, img: "assets/img/cut-combo-pipoca.webp", note: "Pipocas de pollo con papas + soda 300 ml.", hot: true, cut: true },
      { id: "entero", name: "Pollo Entero", price: 125, img: "assets/img/p-pollo-entero.webp", note: "Pollo entero sin guarnición." },
      { id: "pipocas", name: "Pipocas con Papas", price: 32, img: "assets/img/cut-pipocas.webp", note: "Pipocas de pollo con papas.", cut: true },
    ],

    featured: [
      { ref: "pierna-brasa", name: "Pollo a la Brasa", tag: "La de siempre", img: "assets/img/pollo-entero-mesa.webp", desc: "La receta que nos hizo campeones desde 1981. Pierna Bs 37 · Pecho Bs 39.", price: 37, from: true },
      { ref: "broaster-pierna", name: "Broaster Pierna", tag: "Crocante", img: "assets/img/p-pierna-broaster.webp", desc: "Pierna de pollo broaster.", price: 37 },
      { ref: "lasana-carne", name: "Lasañas", tag: "Pastas", img: "assets/img/lasana.webp", desc: "De carne o de pollo, Bs 38. La de pollo no está disponible en Ventura Mall.", price: 38 },
    ],

    // WEB /locales/ — addresses & map links as published. Hours: NOT public → open/close null.
    // whatsapp: only Villa 1ro de Mayo has its own (LT "Delivery Villa 1ro de Mayo" → 59165060555).
    branches: [
      { id: "canoto", name: "Casco Viejo · Cañoto", num: "1 y 8", address: "Av. Cañoto 571, esquina Junín", maps: "https://g.page/PollosChampion?share", img: "assets/stores/canoto.webp", hq: true },
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
    ],

    // Delivery: LT links + PedidosYa chain page + "Yango" tag on CAL
    delivery: [
      { name: "WhatsApp Delivery Pollos Campeón", url: "https://wa.me/59179888975" },              // LT
      { name: "WhatsApp Delivery Villa 1ro de Mayo", url: "https://wa.me/59165060555" },           // LT
      { name: "Alex Delivery", url: "https://play.google.com/store/apps/details?id=com.dianit.alex" }, // LT
      { name: "PedidosYa", url: "https://www.pedidosya.com.bo/cadenas/pollos-campeon" },           // pedidosya.com.bo/cadenas/pollos-campeon
      { name: "Yango", url: null },                                                                // CAL tag on Combo Coca-Cola
    ],

    facts: [
      "Pollos Campeón es una cadena de pollo a la brasa y broaster de Santa Cruz de la Sierra, Bolivia, con tradición desde 1981.",
      "Su lema es «El pollo #1 de Bolivia».",
      "La casa matriz está en Av. Cañoto 571, esquina Junín (Casco Viejo).",
      "Septiembre es su mes aniversario, junto con el mes de Santa Cruz.",
      "Pedidos y delivery por WhatsApp al 798-88975. La sucursal Villa 1ro de Mayo tiene su propio WhatsApp de delivery: 650-60555.",
      "Atención al cliente: 7989-9998.",
      "También se puede pedir por Alex Delivery y PedidosYa; el Combo Coca-Cola figura con Yango.",
      "Los precios del menú son para venta en local.",
      "Las promos del calendario son válidas en el local, delivery y para llevar. Sábados y domingos no tienen promo del día.",
      "La Lasaña de Pollo no está disponible en Ventura Mall.",
      "En noviembre de 2026 Pollos Campeón atendió a los jugadores del Abierto Nacional en Mapaizo Golf Club.",
    ],

    // Store photos rail (WEB /locales/ photos) — each links to the branch on Google Maps
    gallery: [
      { img: "assets/stores/fachada-roja.webp", caption: "El rojo campeón", ref: null },
      { img: "assets/stores/biopetrol.webp", caption: "Biopetrol · 7mo anillo", ref: "biopetrol" },
      { img: "assets/stores/ventura.webp", caption: "Ventura Mall", ref: "ventura" },
      { img: "assets/stores/mural.webp", caption: "Tenés salsa de Campeón", ref: null },
      { img: "assets/stores/paragua.webp", caption: "Paragua · 4to anillo", ref: "paragua" },
      { img: "assets/stores/canoto-2.webp", caption: "Cañoto 571 · la casa matriz", ref: "canoto" },
      { img: "assets/stores/megacenter.webp", caption: "MegaCenter", ref: "megacenter" },
      { img: "assets/stores/km12-interior.webp", caption: "Km 12 · Doble Vía La Guardia", ref: "km12" },
    ],

    // Real captions from IG posts (no IG media is hot-linked)
    posts: [
      { url: "https://www.instagram.com/p/DgAoi4nPrvO/", date: "2026-11-21", text: "🎄 ¡Celebra con el Pack Navideño! 🍽️ Para 8 personas | Bs 750", color: "red" },
      { url: "https://www.instagram.com/p/Df9rSfuh9hc/", date: "2026-11-20", text: "¿Ya descubrieron esta parte del mapa? 👀📍 La misión más deliciosa está en Campeón… ¡lo difícil es elegir qué pedir!", color: "blue" },
      { url: "https://www.instagram.com/p/Df5KEkyv6i8/", date: "2026-11-18", text: "⛳ Así vivimos el Abierto Nacional en Mapaizo Golf Club. Orgullosos de participar y atender a todos los jugadores.", color: "yellow" },
      { url: "https://www.instagram.com/p/De2fzB5PtNc/", date: "2026-10-23", text: "Etiquetá a esa persona a la que no le confiarías tu plato 👇", color: "orange" },
    ],
  };
  return CAMPEON;
});
