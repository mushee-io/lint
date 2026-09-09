# Watch v2 — Continuous Market Surveillance

Watch is Market Lint's post-launch surveillance layer. Guard evaluates a market before listing; Watch continuously evaluates persisted market state after listing and emits durable, evidence-backed risk signals.

## Surveillance signals

Watch v2 evaluates up to the latest 12 persisted market snapshots and source health. Current signal types include:

- `DATA_STALE` — the market feed is stale or unknown.
- `SOURCE_FAILURE` — the configured upstream source has repeated failures or unhealthy freshness.
- `PROBABILITY_SHOCK` — a single persisted probability move exceeds the configured threshold.
- `PROBABILITY_REGIME_SHIFT` — the latest probability materially diverges from the recent persisted median.
- `LIQUIDITY_DRAWDOWN` — liquidity falls sharply between observations.
- `LIQUIDITY_REGIME_CHANGE` — liquidity drops below half of its recent persisted high-water mark.
- `VOLUME_ACCELERATION` — volume growth exceeds its recent baseline while probability also moves.
- `RESOLUTION_SOURCE_CHANGED` — the resolution source changes after Watch monitoring begins.

Signals are conservative operational alerts, not claims of manipulation. Each signal stores severity, confidence, explanation, evidence, recommended action, algorithm version, market/watch linkage, and a deterministic deduplication key.

## Worker execution

The existing `EVALUATE_WATCHES` worker job now runs Watch v2. The production scheduler therefore evaluates active Watch registrations continuously without requiring a separate service or manual request.

## Watch registration

`POST /api/v1/watch` creates or reactivates a Watch registration. New registrations persist a baseline containing the initial resolution source and market status so later changes can be detected.

Required permission: `watch:write` and Developer role or higher.

`GET /api/v1/watch` requires `watch:read` and returns tenant-scoped registrations with recent risk signals.

## Incident queue

Every persisted Watch signal is exposed as an operator incident.

```text
GET  /api/v1/incidents
POST /api/v1/incidents/:id
```

`GET /api/v1/incidents` requires `incidents:read` and supports `status`, `severity`, and `limit` query parameters.

Incident actions are:

- `ACKNOWLEDGE`
- `RESOLVE`
- `REOPEN`

Actions require `incidents:write` and Analyst role or higher. Incident state is stored as immutable audit events. Resolving an incident never deletes or changes the underlying Watch signal or its evidence.

## Operator UI

- `/protocol/watch` — monitored markets, last evaluation state, freshness, and recent surveillance signals.
- `/protocol/incidents` — tenant-scoped incident queue with filtering, evidence inspection, acknowledgement, resolution, and reopening.
- `/protocol/markets/:id` — market-level intelligence workspace for deeper investigation.

## Truth boundaries

Watch operates only on persisted evidence available to Market Lint. A probability shock or volume acceleration is an anomaly signal, not proof of manipulation or wrongdoing. Source-change detection only claims that the persisted resolution-source field changed after the Watch baseline. Webhook delivery uses the existing signed webhook pipeline.

Algorithm version: `watch-v2`.
