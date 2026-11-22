// Calls the public Supabase RPCs (place_order, track_order) with the publishable key. 6 s timeout.
// Not configured or unreachable → { unreachable: true } so the WhatsApp order still goes out.
const CFG = require("../js/config.js");

async function rpc(fn, body, { timeout = 6000, fetchImpl = globalThis.fetch } = {}) {
  if (!CFG.supabaseUrl || !CFG.supabaseKey) return { unreachable: true, reason: "not_configured" };
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetchImpl(`${CFG.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
      method: "POST", signal: ctl.signal,
      headers: { apikey: CFG.supabaseKey, "Content-Type": "application/json", ...(/^eyJ/.test(CFG.supabaseKey) ? { Authorization: `Bearer ${CFG.supabaseKey}` } : {}) },
      body: JSON.stringify(body),
    });
    const txt = await r.text();
    let data = null; try { data = JSON.parse(txt); } catch { /* not json */ }
    if (r.ok) return data && typeof data === "object" ? data : { ok: false, error: "bad_response" };
    const msg = (data && (data.message || data.error)) || txt;
    if (r.status >= 500) return { unreachable: true, reason: `http_${r.status}` };
    return { ok: false, error: String(msg).slice(0, 120) };
  } catch (e) {
    return { unreachable: true, reason: e && e.name === "AbortError" ? "timeout" : "network" };
  } finally { clearTimeout(t); }
}

const backend = {
  placeOrder: (payload) => rpc("place_order", { payload }),
  trackOrder: (token) => rpc("track_order", { token }),
};
module.exports = { rpc, backend };
