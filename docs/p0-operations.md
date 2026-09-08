# Market Lint P0 operations

## Required environment

- `DATABASE_URL`: PostgreSQL connection string.
- `WEBHOOK_ENCRYPTION_KEY`: application secret used to encrypt webhook signing secrets at rest.
- `WORKER_SECRET`: protects worker and operator endpoints.
- `BOOTSTRAP_SECRET`: protects initial organization bootstrap.
- `MARKET_LINT_PILOT_ORG_ID`: optional organization exposed in the internal pilot control-center deployment.

## Durable pipeline

`Polymarket Gamma -> normalization -> Market/DataProvenance/MarketSnapshot -> freshness -> Watch -> RiskSignal -> WebhookDelivery`

Canonical events use conservative exact normalized-title fingerprints. Cross-protocol consensus is persisted only when two or more qualifying protocol inputs exist; otherwise `INSUFFICIENT_DATA` is stored.

## Local startup

1. Start Docker Desktop.
2. Run `docker compose up -d db`.
3. Set `DATABASE_URL=postgresql://marketlint:marketlint@localhost:5432/marketlint` in a local ignored environment file.
4. Run `npm install` until the committed lockfile has been regenerated, then `npm run db:setup`.
5. Run `npm run dev` and, in a second terminal, `npm run worker`.

The full Compose stack also includes `app` and `worker` services.

## Bootstrap

POST `/api/v1/organizations` with `x-bootstrap-secret`. The response returns the first sandbox API key exactly once.

## Worker fallback

A scheduler may POST `/api/internal/worker` with `x-worker-secret`. This uses the same durable PostgreSQL job queue as the dedicated worker process.

## Webhooks

Secrets are encrypted at rest. Production delivery requires HTTPS and rejects literal/private resolved addresses. Deliveries are signed with HMAC-SHA256 over `<timestamp>.<body>`, use an idempotency key, retry with exponential backoff, and move to `DEAD_LETTER` after the configured maximum attempts.

## Operational checks

- `/health` is liveness only.
- `/ready` verifies PostgreSQL and required persistent tables.
- `/api/internal/ops` returns source freshness, worker backlog, webhook backlog, and persisted intelligence counts and requires `x-worker-secret`.

## Honest integration boundary

Polymarket Gamma is the only live public source currently implemented. Rain remains blocked pending official access/schema/feed details. Market Lint must not report cross-protocol consensus from a single source.
