import { createServer } from 'http';
import { parse } from 'url';

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");
const PORT = process.env.PORT || 3000;

const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive",
  "proxy-authenticate", "proxy-authorization", "te",
  "trailer", "transfer-encoding", "upgrade",
  "forwarded", "x-forwarded-host", "x-forwarded-proto", "x-forwarded-port"
]);

if (!TARGET_BASE) {
  console.error("❌ ERROR: TARGET_DOMAIN environment variable is not set");
  process.exit(1);
}

console.log(`✅ Relay running on port ${PORT}`);
console.log(`🎯 Target: ${TARGET_BASE}`);

const server = createServer(async (req, res) => {
  try {
    const parsedUrl = parse(req.url, true);
    const targetUrl = TARGET_BASE + parsedUrl.pathname + (parsedUrl.search || "");
    
    const headers = new Headers();
    let clientIp = null;
    
    for (const [key, value] of Object.entries(req.headers)) {
      const k = key.toLowerCase();
      if (STRIP_HEADERS.has(k)) continue;
      if (k === "x-real-ip") { clientIp = value; continue; }
      if (k === "x-forwarded-for") { if (!clientIp) clientIp = value; continue; }
      headers.set(k, value);
    }
    
    if (clientIp) headers.set("x-forwarded-for", clientIp);
    if (req.headers["host"]) headers.set("host", req.headers["host"]);
    
    const fetchOpts = {
      method: req.method,
      headers,
      redirect: "manual"
    };
    
    if (req.method !== "GET" && req.method !== "HEAD") {
      fetchOpts.body = req;
      fetchOpts.duplex = "half";
    }
    
    const upstream = await fetch(targetUrl, fetchOpts);
    
    res.writeHead(upstream.status, Object.fromEntries(upstream.headers));
    upstream.body.pipe(res);
    
  } catch (err) {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Bad Gateway");
  }
});

server.listen(PORT);