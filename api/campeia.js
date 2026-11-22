// POST /api/campeia — Campe-IA, Pollos Campeón's ordering assistant.
// Tool-calling agent loop; streams NDJSON events (text, cart, options, readback, location, order, track, handoff, state, error).
// Provider: CAMPEIA_PROVIDER forces one; otherwise NVIDIA if NVIDIA_API_KEY, else Anthropic if ANTHROPIC_API_KEY.
// No key → 503 not_configured (the widget shows "coming soon").
const { createSession, anthropicTools, openaiTools } = require("./_tools.js");
const { SYSTEM_PROMPT, liveContext } = require("./_prompt.js");
const { personaBlock } = require("./_persona.js");
const { backend } = require("./_backend.js");

const MAX_ROUNDS = 6;
const STATIC_SYSTEM = `${SYSTEM_PROMPT}\n\n${personaBlock()}`;
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  if (hits.size > 5000) hits.clear();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  arr.push(now); hits.set(ip, arr);
  return arr.length > 15;
}

function provider(env = process.env) {
  const forced = (env.CAMPEIA_PROVIDER || "").toLowerCase();
  if (forced === "anthropic") return env.ANTHROPIC_API_KEY ? "anthropic" : null;
  if (forced === "nvidia") return env.NVIDIA_API_KEY ? "nvidia" : null;
  if (env.NVIDIA_API_KEY) return "nvidia";
  if (env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

function cleanMessages(raw) {
  if (!Array.isArray(raw)) return null;
  let msgs = raw.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 1200) })).slice(-16);
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  msgs = msgs.reduce((a, m) => { const l = a[a.length - 1]; if (l && l.role === m.role) l.content += "\n" + m.content; else a.push({ ...m }); return a; }, []);
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") return null;
  return msgs;
}

// A clear "yes" to the read-back (≤ 60 chars, no hedges or changes)
function isYes(text) {
  const t = String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  if (!t || t.length > 60) return false;
  if (/\b(no|pero|cambi\w*|quit\w*|sac\w*|agreg\w*|añad\w*|anad\w*|mas|espera\w*|mejor|but|change|remove|add|wait|instead)\b/.test(t)) return false;
  return /\b(si+|sip|dale|ok(ay)?|okey|listo|confirm\w*|de una|claro|perfecto|va|vamos|ya|correcto|esta bien|todo bien|yes|yep|sure|go ahead|enviar|mandalo|hacelo)\b|👍|✅/.test(t);
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return null; }
}

// Runs one assistant turn. `llm` = { kind, call(round) } adapters below; separated for tests.
async function runTurn({ messages, state, channel, write, llmFactory, date, siteUrl, backendImpl }) {
  const session = createSession(state, { date, backend: backendImpl === undefined ? backend : backendImpl, siteUrl, channel });
  const st = session.state;
  const flush = () => { for (const e of session.drain()) write(e); };
  const tokenAtStart = st.stage === "awaiting_confirmation" ? st.token : null;
  const lastUser = messages[messages.length - 1].content;
  const yes = isYes(lastUser);
  let serverPlaced = null;

  // Guard 1: the SERVER places the order on a clear yes, before the model runs.
  if (tokenAtStart && yes) {
    serverPlaced = await session.run("place_order", { token: tokenAtStart });
    flush();
  }

  // Guard 2: any place_order from the model is refused unless the request began awaiting confirmation,
  // the newest message is a yes and the token is unchanged.
  const guardedRun = async (name, args) => {
    if (name === "place_order") {
      if (serverPlaced) return serverPlaced.error ? serverPlaced : { already_placed: true, code: st.placed && st.placed.code, instruction: "Ya está confirmado: decile que toque el botón de WhatsApp." };
      if (!tokenAtStart || !yes || (args && args.token) !== tokenAtStart || st.token !== tokenAtStart)
        return { refused: true, instruction: "No podés confirmar todavía. Mostrá el resumen (prepare_order) y esperá que el cliente diga que sí en su próximo mensaje." };
    }
    const r = await session.run(name, args);
    flush();
    return r;
  };

  const extra = serverPlaced
    ? (serverPlaced.error ? `\nEl servidor intentó confirmar y falló: ${serverPlaced.reason || serverPlaced.error}. Explicalo y ofrecé alternativas.` : `\nEl servidor YA confirmó el pedido ${serverPlaced.code}. No llames place_order. Decile en una oración que toque el botón verde de WhatsApp.`)
    : "";
  const live = liveContext(st, date) + extra + `\nCanal: ${channel}.`;

  let textSoFar = "", needBreak = false;
  const emitText = (t) => {
    if (!t) return;
    if (needBreak) { if (/[.!?…)]\s*$/.test(textSoFar)) { write({ type: "text", text: "\n\n" }); textSoFar += "\n\n"; } needBreak = false; }
    textSoFar += t; write({ type: "text", text: t });
  };

  const llm = llmFactory({ system: STATIC_SYSTEM, live, messages, channel });
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { calls } = await llm.step(emitText);
    if (!calls.length) break;
    const results = [];
    for (const c of calls) results.push({ id: c.id, name: c.name, result: await guardedRun(c.name, c.args) });
    llm.addResults(calls, results);
    if (textSoFar) needBreak = true;
    if (round === MAX_ROUNDS - 1) llm.finalNoTools = true;
  }
  flush();
  write({ type: "state", state: st });
  return { state: st, text: textSoFar };
}

// ---------- provider adapters ----------
function anthropicLLM({ system, live, messages, channel }) {
  const Anthropic = require("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = channel === "voice" ? (process.env.CAMPEIA_VOICE_MODEL || "claude-haiku-5-5") : (process.env.CAMPEIA_MODEL || "claude-sonnet-5-5");
  const convo = messages.map((m) => ({ role: m.role, content: m.content }));
  const tools = anthropicTools();
  const self = {
    finalNoTools: false,
    async step(onText) {
      const stream = client.messages.stream({
        model, max_tokens: channel === "voice" ? 300 : 700,
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }, { type: "text", text: live }],
        tools, tool_choice: self.finalNoTools ? { type: "none" } : { type: "auto" }, messages: convo,
      });
      stream.on("text", onText);
      const msg = await stream.finalMessage();
      convo.push({ role: "assistant", content: msg.content });
      return { calls: msg.content.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id, name: b.name, args: b.input })) };
    },
    addResults(calls, results) {
      convo.push({ role: "user", content: results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: JSON.stringify(r.result) })) });
    },
  };
  return self;
}

function nvidiaLLM({ system, live, messages, channel }, OpenAIImpl) {
  const OpenAI = OpenAIImpl || require("openai");
  const client = new OpenAI({ apiKey: process.env.NVIDIA_API_KEY || "test", baseURL: "https://integrate.api.nvidia.com/v1" });
  const model = process.env.CAMPEIA_NVIDIA_MODEL || "meta/llama-3.3-70b-instruct";
  const convo = [{ role: "system", content: `${system}\n\n${live}` }, ...messages];
  const tools = openaiTools();
  const self = {
    finalNoTools: false,
    async step(onText) {
      const stream = await client.chat.completions.create({ model, messages: convo, tools, tool_choice: self.finalNoTools ? "none" : "auto", stream: true, temperature: 0.3, max_tokens: channel === "voice" ? 300 : 700 });
      let text = ""; const acc = [];
      for await (const chunk of stream) {
        const d = chunk.choices && chunk.choices[0] && chunk.choices[0].delta;
        if (!d) continue;
        if (d.content) { text += d.content; onText(d.content); }
        for (const tc of d.tool_calls || []) {
          const i = tc.index ?? acc.length;
          acc[i] = acc[i] || { id: "", name: "", args: "" };
          if (tc.id) acc[i].id = tc.id;
          if (tc.function && tc.function.name) acc[i].name += tc.function.name;
          if (tc.function && tc.function.arguments) acc[i].args += tc.function.arguments;
        }
      }
      const calls = acc.filter(Boolean).map((c, i) => { let args = {}; try { args = c.args ? JSON.parse(c.args) : {}; } catch { args = {}; } return { id: c.id || `call_${i}`, name: c.name, args, raw: c.args }; });
      convo.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: c.raw || "{}" } })) } : {}) });
      return { calls };
    },
    addResults(calls, results) { for (const r of results) convo.push({ role: "tool", tool_call_id: r.id, content: JSON.stringify(r.result) }); },
  };
  return self;
}

module.exports = async function handler(req, res) {
  // The site's widget sends X-Campeia-Client: 1 and gets soft errors (HTTP 200 + X-Campeia-Status)
  // so the console stays clean before the key is set. Other callers get the real status.
  const soft = req.headers["x-campeia-client"] === "1";
  const fail = (code, error) => {
    res.setHeader("Cache-Control", "no-store");
    if (soft) { res.setHeader("X-Campeia-Status", String(code)); return res.status(200).json({ error }); }
    return res.status(code).json({ error });
  };
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return fail(405, "method_not_allowed"); }
  const prov = provider();
  if (!prov) return fail(503, "not_configured");
  const ip = String(req.headers["x-forwarded-for"] || (req.socket && req.socket.remoteAddress) || "anon").split(",")[0].trim();
  if (limited(ip)) return fail(429, "rate_limited");
  const body = await readBody(req);
  const messages = cleanMessages(body && body.messages);
  if (!messages) return fail(400, "bad_request");
  const channel = body.channel === "voice" ? "voice" : "text";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const siteUrl = host ? `${req.headers["x-forwarded-proto"] || "https"}://${host}` : "";

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  const write = (e) => { try { res.write(JSON.stringify(e) + "\n"); } catch { /* client gone */ } };
  try {
    await runTurn({ messages, state: body.state, channel, write, siteUrl, llmFactory: (o) => (prov === "anthropic" ? anthropicLLM(o) : nvidiaLLM(o)) });
  } catch (e) {
    console.error(JSON.stringify({ evt: "campeia_error", msg: String(e && e.message).slice(0, 300), status: e && e.status }));
    write({ type: "error", kind: e && e.status === 429 ? "rate_limited" : "upstream" });
  }
  res.end();
};
module.exports.runTurn = runTurn;
module.exports.isYes = isYes;
module.exports.provider = provider;
module.exports.cleanMessages = cleanMessages;
module.exports.nvidiaLLM = nvidiaLLM;
