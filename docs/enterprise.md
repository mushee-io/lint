# Milestone 8 — Production / Enterprise Layer

Market Lint's enterprise layer turns the intelligence stack into a tenant-scoped integration surface for prediction-market operators. It does not change Guard, Watch, Event Graph, or Consensus evidence; it controls who can call them, how usage is governed, and how an operator proves the integration is healthy.

## Tenant policy and quotas

Authenticated API-key traffic is metered through durable audit records. The active tenant policy defines a capability class (`SANDBOX`, `PILOT`, `PRO`, or `ENTERPRISE`), tenant status, monthly request capacity, and a per-minute API-key request limit.

Default capability limits are operational defaults, not published pricing. Market Lint operations can override limits per tenant with the bootstrap-authorized policy endpoint.

```text
GET  /api/v1/enterprise/policy
POST /api/v1/enterprise/policy      # internal/bootstrap authorization
GET  /api/v1/enterprise/usage
```

A suspended tenant receives `403`. Exhausted monthly or per-minute capacity receives `429` before protected endpoint business logic runs. Unauthenticated public/demo endpoints are not billed to a tenant.

## API-key lifecycle

API keys remain one-way credentials: only hashes are persisted and a new secret is returned once. Keys are organization-scoped, optionally protocol-scoped, permission-scoped, and separated into `sandbox` and `live` environments.

```text
GET    /api/v1/api-keys
POST   /api/v1/api-keys
DELETE /api/v1/api-keys
POST   /api/v1/api-keys/rotate
```

Rotation creates a replacement with the same protocol, environment and permissions, revokes the previous key, and records the transition in the audit log.

## Audit export

Tenant operations can export durable audit evidence as CSV or JSON.

```text
GET /api/v1/enterprise/audit-export?format=csv
GET /api/v1/enterprise/audit-export?format=json
```

Optional query parameters: `from`, `to`, `limit` (maximum 5,000), and `includeUsage=true`. Usage-meter events are excluded by default so operational audit exports remain readable.

Permission: `audit:export`.

## Webhook observability

Market Lint already encrypts webhook secrets at rest, HMAC-signs deliveries, retries failures with backoff, dead-letters exhausted deliveries, and supports replay. Milestone 8 adds tenant-scoped delivery visibility:

```text
GET  /api/v1/webhooks/stats
POST /api/v1/webhooks/replay
```

The stats endpoint exposes active endpoints, recent delivery state, queue depth and delivery failures without exposing stored webhook secrets.

## Production readiness

```text
GET /api/v1/enterprise/readiness
```

Required checks currently include:

- tenant active
- at least one live API key
- database health
- at least two fresh public data sources
- no dead-letter worker jobs
- no dead-letter webhook deliveries for the tenant
- API quota headroom

An active webhook endpoint is reported as a recommendation rather than a universal blocker because Guard-only integrations may not consume asynchronous alerts.

`/protocol/enterprise` displays the scoped pilot tenant's policy, usage and readiness when `MARKET_LINT_PILOT_ORG_ID` is configured.

## Developer portal

`/developers` is the integration entry point. It documents Bearer-key authentication, SDK quickstart, Guard, Watch, graph/consensus endpoints, enterprise usage/readiness, key rotation, and webhook observability.

## Security boundaries

- Tenant policy writes require `BOOTSTRAP_SECRET`; a customer API key cannot upgrade its own plan or remove suspension.
- API keys are stored only as hashes and secrets are shown once.
- Public traffic cannot spend authenticated AI credits.
- Audit export is tenant-scoped.
- Webhook secrets remain encrypted at rest and are never returned by stats endpoints.
- Demo surfaces remain distinct from persistent partner integrations.

## CI gate

`scripts/enterprise-smoke.ts` verifies policy persistence, live-key usage metering, rate-limit rejection, readiness output, audit CSV export, webhook stats, safe key rotation, revoked-key rejection and replacement-key access. The script is part of `Market Lint CI` and refuses to run against production.

## Scaling note

The current durable usage ledger intentionally reuses `AuditLog`, avoiding a production schema migration during the pilot stage. It is suitable for pilot and early production traffic. Before very high request volume or contractual high-throughput SLAs, move metering to dedicated atomic usage buckets or an external distributed rate-limit service while retaining AuditLog as the evidence trail.
