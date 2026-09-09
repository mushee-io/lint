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

## Grounded AI Reviewer

`POST /api/v1/markets/:id/review` turns deterministic Market Intelligence into an operator-readable review with a `CLEAR`, `REVIEW`, or `HIGH_RISK` verdict, grounded findings, repair actions, wording suggestions, settlement-rule suggestions, and explicit uncertainty. The AI provider is not allowed to override Market Intelligence scores, statuses, evidence, duplicate/event boundaries, or consensus readiness.

Authenticated `auto`/`ai` mode can use the configured provider. Unauthenticated requests are deterministic only, so public traffic cannot spend AI credits. Authenticated reviews are persisted to `AuditLog`. See `docs/ai-reviewer.md`.

## Operator Dashboard

`/protocol/operator` is the live review queue. It ranks persisted markets by intelligence risk, surfaces weak/stale/undecided markets first, and supports title, protocol, freshness, and intelligence-status filters.

`/protocol/markets/:id` is the operator workspace for a single market. It combines the full seven-dimension Market Intelligence report, grounded reviewer findings, evidence, recent snapshots, authenticated AI-review controls, and tenant-scoped operator history.

Operators can record `APPROVE`, `HOLD`, or `REJECT` through:

```text
POST /api/v1/markets/:id/decision
```

The API requires `operator:decision`. Accepted decisions are persisted to `AuditLog` with a snapshot of the current deterministic intelligence state; they do not overwrite Market Lint's score or mutate the third-party source market. See `docs/operator-dashboard.md`.

## Watch v2

Watch is the continuous post-launch surveillance layer. The worker evaluates every active Watch registration against persisted snapshots and source health and emits durable `watch-v2` signals for probability shocks, probability regime shifts, liquidity drawdowns, liquidity regime changes, volume acceleration, stale data, upstream source failures, and resolution-source changes.

Signals are anomaly/risk alerts, not claims of manipulation. Each carries severity, confidence, evidence, a recommended action, a deterministic deduplication key, and signed-webhook delivery through the existing webhook pipeline.

`/protocol/watch` is the monitoring workspace and `/protocol/incidents` is the operator incident queue. Incidents can be acknowledged, resolved, or reopened without altering the underlying Watch signal.

```text
GET  /api/v1/incidents
POST /api/v1/incidents/:id
```

Incident reads require `incidents:read`; actions require `incidents:write` and Analyst role or higher. See `docs/watch-v2.md`.

## Universal Event Graph

Milestone 6 turns canonical-event matching into a durable cross-protocol graph. Market Lint normalizes common market aliases and numeric magnitudes, checks time/threshold compatibility, negation, and directional conditions, and then separates matches into `SAME_EVENT`, `POSSIBLE_SAME_EVENT`, `RELATED_EVENT`, or `UNRELATED`.

Only sufficiently high-confidence equivalents are auto-grouped. Uncertain candidates enter `/protocol/graph`, where an authenticated operator can `CONFIRM_SAME_EVENT`, `MARK_RELATED`, or `REJECT`. Confirmed same-event edges join a graph-aware consensus cluster; possible, related, and rejected edges never count toward consensus just to manufacture agreement.

Persistent graph APIs:

```text
GET  /api/v1/events
GET  /api/v1/events/:id
GET  /api/v1/events/:id/graph
GET  /api/v1/event-relationships
POST /api/v1/event-relationships/:id
```

Relationship queue reads require `graph:read`; graph decisions require `graph:write` and Analyst role or higher. See `docs/event-graph.md`.

## Cross-Protocol Consensus v3

Milestone 7 turns graph-aware consensus into an operator-grade confidence engine. `consensus-v3-confidence` first aggregates markets within each protocol, then combines protocol-level probabilities using operational source reliability and deliberately capped liquidity influence. One venue therefore cannot become "truth" just because it has more duplicate markets or far more liquidity.

Consensus is `READY` only with at least two distinct protocols carrying fresh/aging usable probability data. When multiple venues exist but fewer than two are currently usable it returns `STALE`; with fewer than two independent venues it returns `INSUFFICIENT_DATA`.

Every ready result includes a 0–100 confidence decomposition across agreement, protocol diversity, source reliability, freshness, liquidity support, and persisted history depth. Pairwise venue disagreement is classified from `NONE` through `CRITICAL`; high/critical escalation on watched events creates durable `CONSENSUS_DIVERGENCE` signals and signed-webhook delivery.

```text
GET /api/v1/events/:id/consensus
GET /api/v1/events/:id/divergence
GET /api/v1/protocols/:protocol/reputation
```

`/protocol/consensus` is the cross-protocol control center with event confidence, dispersion, divergence alerts, history-backed status, and observed protocol reliability. See `docs/consensus-v3.md`.

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

PostgreSQL and Prisma persist organizations, roles, API keys, protocols, normalized markets, snapshots, provenance, canonical events, event relationships, Watch registrations, Guard evaluations, risk signals, consensus snapshots, source freshness, worker jobs, webhook deliveries, pilots, metrics, feedback, reports, audit logs, authenticated reviewer audit records, operator decisions, Watch baselines, incident lifecycle actions, event-relationship review decisions, consensus history, confidence evidence, and cross-protocol divergence alerts.

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

The worker continuously schedules both public sources, freshness evaluation, Watch v2 surveillance, confidence-aware graph consensus refreshes, and webhook delivery. Every persisted live market carries source/provenance metadata; source failures remain visible in `DataSourceState`.

## Protocol intelligence

Core persistent endpoints include Guard, Market Intelligence, the grounded AI Reviewer, operator decisions, Watch, incidents, Signals, the Universal Event Graph, Consensus v3, divergence intelligence, observed protocol reliability, webhooks, pilot metrics/reports, protocol workspaces, health, and readiness.

```text
POST /api/v1/guard
GET  /api/v1/markets/:id/intelligence
POST /api/v1/markets/:id/review
POST /api/v1/markets/:id/decision
POST /api/v1/watch
GET  /api/v1/signals
GET  /api/v1/incidents
POST /api/v1/incidents/:id
GET  /api/v1/events
GET  /api/v1/events/:id/graph
GET  /api/v1/event-relationships
POST /api/v1/event-relationships/:id
GET  /api/v1/events/:id/consensus
GET  /api/v1/events/:id/divergence
GET  /api/v1/protocols/:protocol/reputation
```

`/protocol` shows durable operational values. `/protocol/operator` is the risk-ranked operator queue. `/protocol/incidents` is the Watch incident queue. `/protocol/graph` is the canonical-event review workspace. `/protocol/consensus` is the consensus and confidence control center. `/protocol/pilot` is tenant-scoped by `MARKET_LINT_PILOT_ORG_ID` in the pilot deployment.

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

CI also runs deterministic Guard, Market Intelligence/Reviewer, Watch v2/incident, Universal Event Graph, Consensus v3 confidence/divergence, live ingestion, resilience, worker-soak, and pilot-preflight gates.

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

Optional provider-backed review uses `OPENAI_API_KEY`; `MARKET_LINT_AI_MODEL` can override the configured model. If the provider is missing or unavailable, `auto` mode is explicitly labeled `DETERMINISTIC_FALLBACK` rather than being represented as AI-generated output.

## Demo and developer surfaces

`/analyze`, `/explore`, `/terminal`, `/protocol/demo`, and the existing Rain demo remain useful product demonstrations. Demo or mocked views are labeled as such and must not be cited as evidence of a live partner integration. The SDK source is in `packages/sdk`.

## License

Market Lint is licensed under the [Apache License 2.0](LICENSE).

Copyright 2026 Mushee.

The Market Lint name, logos, branding, and visual identity are not granted under the Apache License 2.0 and remain the property of Mushee.