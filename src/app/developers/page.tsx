import Link from "next/link";

const endpoints = [
  ["POST", "/api/v1/guard", "Pre-listing market risk gate"],
  ["GET", "/api/v1/markets/:id/intelligence", "Seven-dimension market intelligence"],
  ["POST", "/api/v1/markets/:id/review", "Grounded AI/deterministic reviewer"],
  ["POST", "/api/v1/watch", "Register continuous market surveillance"],
  ["GET", "/api/v1/incidents", "Operator incident queue"],
  ["GET", "/api/v1/events/:id/graph", "Universal event graph"],
  ["GET", "/api/v1/events/:id/consensus", "Cross-protocol consensus + confidence"],
  ["GET", "/api/v1/events/:id/divergence", "Venue divergence intelligence"],
  ["GET", "/api/v1/enterprise/usage", "Tenant quota and integration usage"],
  ["GET", "/api/v1/enterprise/readiness", "Production readiness evidence"],
  ["GET", "/api/v1/enterprise/audit-export", "Tenant audit export"],
  ["POST", "/api/v1/api-keys/rotate", "Zero-copy API key rotation"],
  ["GET", "/api/v1/webhooks/stats", "Webhook delivery observability"],
] as const;

export default function Developers() {
  return <main className="mx-auto min-h-screen max-w-6xl border-x border-zinc-200 bg-white text-zinc-950">
    <header className="p-6 md:p-12"><div className="flex items-center justify-between"><Link href="/" className="text-sm underline">MARKET LINT</Link><Link href="/protocol/enterprise" className="text-sm underline">Enterprise controls</Link></div><p className="mt-16 font-mono text-xs tracking-widest text-zinc-500">DEVELOPER PORTAL / API V1</p><h1 className="mt-4 text-6xl tracking-[-.07em]">Integrate market intelligence, not another market.</h1><p className="mt-8 max-w-3xl text-lg leading-8 text-zinc-600">Use Guard before listing, Watch after listing, and Event Graph + Consensus when you need cross-protocol context. Live integrations authenticate with tenant-scoped API keys.</p></header>

    <section className="border-t border-zinc-200 p-6 md:p-12"><p className="font-mono text-[10px] tracking-wider text-zinc-500">QUICKSTART</p><pre className="mt-4 overflow-auto bg-zinc-950 p-6 text-sm leading-7 text-white">{`import { MarketLint } from "@marketlint/sdk";\n\nconst lint = new MarketLint({\n  baseUrl: "https://lint-chi.vercel.app",\n  apiKey: process.env.MARKET_LINT_API_KEY,\n});\n\nconst guard = await lint.guardMarket({\n  title: "Will BTC close above $150,000 on December 31, 2026?",\n  outcomes: ["YES", "NO"],\n  closeTime: "2026-12-31T23:59:59Z",\n  resolutionSource: "https://www.coinbase.com/price/bitcoin",\n});`}</pre><p className="mt-4 text-sm text-zinc-600">Send keys as <code>Authorization: Bearer ml_live_...</code> or <code>x-api-key</code>. Secrets are shown once. Rotate keys through the API instead of copying credentials between systems.</p></section>

    <section className="border-t border-zinc-200 p-6 md:p-12"><div className="flex items-end justify-between"><div><p className="font-mono text-[10px] tracking-wider text-zinc-500">PRODUCTION API</p><h2 className="mt-3 text-3xl tracking-[-.04em]">Operator surfaces</h2></div><a className="text-sm underline" href="/openapi.json">OpenAPI</a></div><div className="mt-8 divide-y divide-zinc-200 border-y border-zinc-200">{endpoints.map(([method, path, description]) => <div key={`${method}-${path}`} className="grid gap-2 py-4 md:grid-cols-[80px_1fr_1fr]"><span className="font-mono text-xs">{method}</span><code className="text-sm">{path}</code><span className="text-sm text-zinc-600">{description}</span></div>)}</div></section>

    <section className="grid border-t border-zinc-200 md:grid-cols-3"><div className="border-b border-zinc-200 p-8 md:border-b-0 md:border-r"><p className="font-mono text-[10px] tracking-wider text-zinc-500">TENANT ISOLATION</p><p className="mt-4 text-sm leading-6 text-zinc-600">API keys are scoped to an organization, optional protocol, environment and permission set. Tenant data reads are filtered by that organization.</p></div><div className="border-b border-zinc-200 p-8 md:border-b-0 md:border-r"><p className="font-mono text-[10px] tracking-wider text-zinc-500">QUOTAS</p><p className="mt-4 text-sm leading-6 text-zinc-600">Authenticated API traffic is durably metered. Tenant policy controls monthly request capacity and per-minute API-key limits. A suspended tenant or exhausted quota is rejected before business logic runs.</p></div><div className="p-8"><p className="font-mono text-[10px] tracking-wider text-zinc-500">WEBHOOKS</p><p className="mt-4 text-sm leading-6 text-zinc-600">Webhook secrets are encrypted at rest, payloads are HMAC signed, retries use backoff/dead-letter handling, and operators can inspect delivery health and replay failed deliveries.</p></div></section>
  </main>;
}
