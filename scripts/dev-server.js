// Tiny local server (no Vercel login needed): static files + /api/<name> functions. node scripts/dev-server.js [port]
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), PORT = +process.argv[2] || 3000;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".mp4": "video/mp4", ".webmanifest": "application/manifest+json" };
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname.startsWith("/api/") && !path.basename(url.pathname).startsWith("_")) {
    const f = path.join(ROOT, url.pathname + ".js");
    if (!fs.existsSync(f)) { res.statusCode = 404; return res.end("not found"); }
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
    return require(f)(req, res);
  }
  let p = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!p.startsWith(ROOT)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  if (!fs.existsSync(p)) { res.statusCode = 404; return res.end("not found"); }
  const stat = fs.statSync(p), type = TYPES[path.extname(p)] || "application/octet-stream";
  const range = req.headers.range;
  if (range && type === "video/mp4") {
    const [s, e] = range.replace("bytes=", "").split("-"); const start = +s, end = e ? +e : stat.size - 1;
    res.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${stat.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1, "Content-Type": type });
    return fs.createReadStream(p, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": stat.size });
  fs.createReadStream(p).pipe(res);
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
