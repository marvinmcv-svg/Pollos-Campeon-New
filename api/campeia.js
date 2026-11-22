// POST /api/campeia — Campe-IA, the virtual receptionist of Pollos Campeón.
// Streams plain text. Provider: Anthropic (Claude) or NVIDIA NIM (OpenAI-compatible).
// Keys are read ONLY from environment variables. With no key → 503 not_configured.
const { SYSTEM_PROMPT, liveContext } = require("./_prompt.js");

const hits = new Map(); // best-effort per-IP rate limit (per warm instance)
const LIMIT = 12, WINDOW = 60_000;
function limited(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const arr = (hits.get(ip) || []).filter((t) => now - t < WINDOW);
  arr.push(now); hits.set(ip, arr);
  return arr.length > LIMIT;
}

function provider() {
  const forced = (process.env.CAMPEIA_PROVIDER || "").toLowerCase();
  if (forced === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (forced === "nvidia" && process.env.NVIDIA_API_KEY) return "nvidia";
  if (forced) return null;
  if (process.env.NVIDIA_API_KEY) return "nvidia";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

function sanitize(body) {
  const raw = body && Array.isArray(body.messages) ? body.messages : null;
  if (!raw) return null;
  let msgs = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 1200) }))
    .slice(-16);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  // merge consecutive same-role turns so the alternation is valid
  msgs = msgs.reduce((a, m) => { const last = a[a.length - 1]; if (last && last.role === m.role) last.content += "\n" + m.content; else a.push({ ...m }); return a; }, []);
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return null; }
}

module.exports = async function handler(req, res) {
  // The site's own widget sends X-Campeia-Client: 1 and receives soft errors (HTTP 200 +
  // X-Campeia-Status) so the browser console stays clean before the key is set.
  // Any other caller gets the real status code.
  const soft = req.headers["x-campeia-client"] === "1";
  const fail = (code, error) => {
    if (soft) { res.setHeader("X-Campeia-Status", String(code)); res.setHeader("Cache-Control", "no-store"); return res.status(200).json({ error }); }
    return res.status(code).json({ error });
  };
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return fail(405, "method_not_allowed"); }
  const prov = provider();
  if (!prov) return fail(503, "not_configured");

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "anon").split(",")[0].trim();
  if (limited(ip)) return fail(429, "rate_limited");

  const messages = sanitize(await readBody(req));
  if (!messages) return fail(400, "bad_request");

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  const live = liveContext(new Date());

  try {
    if (prov === "anthropic") {
      const Anthropic = require("@anthropic-ai/sdk");
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      // live context goes AFTER the conversation (in the last user turn), never in the cached system prompt
      const convo = messages.map((m, i) => i === messages.length - 1
        ? { role: "user", content: [{ type: "text", text: m.content }, { type: "text", text: live }] }
        : m);
      const stream = client.messages.stream({
        model: process.env.CAMPEIA_MODEL || "claude-sonnet-5-5",
        max_tokens: 1024,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages: convo,
      });
      for await (const ev of stream) {
        if (ev.type === "content_block_delta" && ev.delta && ev.delta.type === "text_delta") res.write(ev.delta.text);
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === "refusal") res.write("\n\nDe eso no puedo ayudarte 🙏, pero si querés te cuento del menú o las promos de Pollos Campeón 🍗.");
      else if (final.stop_reason === "max_tokens") res.write("…");
    } else {
      const OpenAI = require("openai");
      const client = new OpenAI({ apiKey: process.env.NVIDIA_API_KEY, baseURL: "https://integrate.api.nvidia.com/v1" });
      const stream = await client.chat.completions.create({
        model: process.env.CAMPEIA_NVIDIA_MODEL || "meta/llama-3.3-70b-instruct",
        temperature: 0.6, top_p: 0.95, max_tokens: 1024, stream: true,
        messages: [{ role: "system", content: SYSTEM_PROMPT + "\n\n" + live }, ...messages],
      });
      for await (const chunk of stream) {
        const t = chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content; // never reasoning_content
        if (t) res.write(t);
      }
    }
  } catch (err) {
    console.error(`[campeia] provider=${prov} status=${err && err.status} message=${err && err.message}`);
    res.write("\n\n[[error]]");
  }
  res.end();
};
