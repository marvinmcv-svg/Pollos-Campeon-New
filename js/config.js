/*
 * Public backend config (safe to ship). The Supabase *publishable* key is designed to be public:
 * row-level security limits it to place_order / track_order and reading the menu and stores.
 * Leave supabaseUrl empty to run website + Campe-IA + WhatsApp only (orders still go out by WhatsApp).
 * siteUrl: the public origin used in tracking links (empty = the page's own origin / the request host).
 */
(function (root, factory) {
  const cfg = factory();
  if (typeof module === "object" && module.exports) module.exports = cfg;
  else root.CAMPEON_CONFIG = cfg;
})(typeof self !== "undefined" ? self : this, function () {
  const env = typeof process !== "undefined" && process.env ? process.env : {};
  return {
    supabaseUrl: env.SUPABASE_URL || "",
    supabaseKey: env.SUPABASE_PUBLISHABLE_KEY || "",
    siteUrl: env.SITE_URL || "",
    trackPath: "/sigue-tu-pollo/",
  };
});
