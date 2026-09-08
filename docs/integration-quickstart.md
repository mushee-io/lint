# Market Lint — 5 minute integration

Market Lint is a read-only intelligence layer. It does not custody funds, execute trades, or act as settlement authority.

## 1. Create a workspace

Create an organization and protocol through the authenticated API, then create a scoped API key. Store the key once; Market Lint persists only its hash.

## 2. Guard a market before listing

Call `POST /api/v1/guard` with the proposed title, outcomes, description, resolution source, and protocol context. Treat `ALLOW` as low-friction, `REVIEW` as human review required, and `BLOCK` as strong evidence that the market should not be listed unchanged.

## 3. Watch a live market

Call `POST /api/v1/watch` for markets that should be continuously evaluated. Watch registrations are durable and scoped to the organization.

## 4. Receive signed signals

Register an HTTPS webhook. Verify `x-marketlint-timestamp`, `x-marketlint-signature`, and `idempotency-key` before processing. Delivery attempts are persisted with retries, dead-letter state, and manual replay.

## 5. Measure the pilot

Use the Pilot Control Center and pilot report endpoint to review markets processed, Guard evaluations, Watch activity, signals, webhook delivery, source freshness, and feedback. Missing measurements are reported as `NO DATA`, never substituted with demo values.

## Production requirements

Use PostgreSQL, run `prisma migrate deploy`, run the web process and worker separately, configure strong `WEBHOOK_ENCRYPTION_KEY`, `WORKER_SECRET`, and `BOOTSTRAP_SECRET` values, and verify `/ready` before sending production traffic.
