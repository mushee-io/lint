# Market Lint

**The intelligence layer for prediction markets.** Market Lint helps protocols create clearer markets, monitor live risk, connect related events, inspect consensus, and approach resolution with better evidence. It is intelligence infrastructure, not a trading venue or settlement authority.

## Current live-source status

- Polymarket Gamma — `LIVE_READ_ONLY`
- Manifold v0 — `LIVE_READ_ONLY`
- Rain — `BLOCKED_PENDING_ACCESS`

Unavailable partner feeds are never replaced with synthetic data in persistent pilot mode.

## Guard v2

Guard is the pre-listing risk gate. `POST /api/v1/guard` evaluates proposed markets before listing and returns `ALLOW`, `REVIEW`, or `BLOCK`, a 0–100 Market Lint score, confidence, rule-level findings, duplicate risk, ambiguity risk, resolution risk, manipulation risk, reasons, warnings, and concrete repair suggestions. See `docs/guard.md`.

## Market Intelligence

`GET /api/v1/markets/:id/intelligence` analyzes an already-ingested market using seven evidence-backed dimensions: market structure, resolution readiness, data integrity, liquidity support, market history, event-graph context, and cross-protocol consensus. It returns a 0–100 intelligence score, grade, `STRONG` / `WATCH` / `WEAK` status, confidence, operator signals, and recommended actions. See `docs/market-intelligence.md`.

## Run locally

```bash
npm install
copy .env.example .env
npm run db:setup
npm run dev
```

Run the durable worker separately:

```bash
npm run worker
```

The frontend still includes clearly labeled deterministic demo surfaces. Persistent protocol APIs require PostgreSQL and do not silently fall back to demo state.

## Database and durability

PostgreSQL and Prisma persist organizations, roles, API keys, protocols, normalized markets, snapshots, provenance, canonical events, Watch registrations, Guard evaluations, risk signals, consensus snapshots, source freshness, worker jobs, webhook deliveries, pilots, metrics, feedback, reports, and audit logs.

```bash
npm run db:generate
npm run db:deploy
npm run db:status
```

## Live ingestion

```bash
npm run smoke:polymarket
npm run smoke:manifold
```

The worker continuously schedules both public sources, freshness evaluation, Watch evaluation, consensus refreshes, and webhook delivery. Every persisted live market carries source/provenance metadata; source failures remain visible in `DataSourceState`.

## Protocol intelligence

Core persistent endpoints include Guard, Market Intelligence, Watch, Signals, Consensus, webhooks, pilot metrics/reports, protocol workspaces, health, and readiness. `/protocol` shows durable operational values. `/protocol/pilot` is tenant-scoped by `MARKET_LINT_PILOT_ORG_ID` in the pilot deployment.

For integration steps, see `docs/integration-quickstart.md`. Rain remains explicitly blocked until official feed/API details are supplied; see `docs/pilots/rain.md`.

## Reliability and security checks

```bash
npm run typecheck
npm run lint
npm test
npm run security:audit
npm run smoke:resilience
npm run build
```

For a longer worker validation run:

```bash
npm run soak:worker
```

The soak defaults to one hour and can be configured with `SOAK_DURATION_MS`, `SOAK_INTERVAL_MS`, or `SOAK_CYCLES`. CI runs a short deterministic soak as a regression gate.

## Pilot deployment

`docker-compose.pilot.yml` provides the production-shaped web/PostgreSQL/migration/worker topology. Supply real secrets externally, warm both live sources, then run:

```bash
npm run pilot:preflight
```

Do not mark a pilot active until preflight passes. Deployment and operational requirements are documented in `docs/deployment.md` and `docs/pilot-readiness.md`.

## Demo and developer surfaces

`/analyze`, `/explore`, `/terminal`, `/protocol/demo`, and the existing Rain demo remain useful product demonstrations. Demo or mocked views are labeled as such and must not be cited as evidence of a live partner integration. The SDK source is in `packages/sdk`.

## License

Market Lint is licensed under the [Apache License 2.0](LICENSE).

Copyright 2026 Mushee.

The Market Lint name, logos, branding, and visual identity are not granted under the Apache License 2.0 and remain the property of Mushee.
