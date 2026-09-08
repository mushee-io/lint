import crypto from "node:crypto";
import http from "node:http";

const secret = process.env.MARKET_LINT_WEBHOOK_SECRET ?? "development-only-secret";
const seen = new Set();
const safeEqual = (a, b) => { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && crypto.timingSafeEqual(left, right); };

http.createServer((req, res) => {
  if (req.method !== "POST") { res.writeHead(405); return res.end(); }
  let body = "";
  req.on("data", chunk => { body += chunk; });
  req.on("end", () => {
    const id = req.headers["idempotency-key"];
    const signature = String(req.headers["x-marketlint-signature"] ?? "");
    const timestampRaw = String(req.headers["x-marketlint-timestamp"] ?? "");
    const timestamp = Number(timestampRaw);
    const expected = crypto.createHmac("sha256", secret).update(`${timestampRaw}.${body}`).digest("hex");
    const fresh = Number.isFinite(timestamp) && Math.abs(Date.now() - timestamp) <= 300_000;
    if (!id || seen.has(id) || !fresh || !safeEqual(signature, expected)) { res.writeHead(401); return res.end("rejected"); }
    seen.add(id);
    console.log("received verified Market Lint event", id);
    res.writeHead(204);
    res.end();
  });
}).listen(8787, () => console.log("Webhook receiver listening on http://localhost:8787"));
