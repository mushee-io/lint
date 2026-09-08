# Market Lint pilot readiness

## Live sources

- Polymarket Gamma — `LIVE_READ_ONLY`
- Manifold v0 — `LIVE_READ_ONLY`
- Rain — `BLOCKED_PENDING_ACCESS`

## Five-minute integration path

1. Create an organization and protocol workspace.
2. Create a scoped API key and store the secret once.
3. Call `POST /api/v1/guard` before listing or updating a market.
4. Register important markets with `POST /api/v1/watch`.
5. Register an HTTPS webhook endpoint for persisted risk signals.
6. Use Pilot Control Center and the pilot report endpoint to review measured activity.

## Rain access required

Market Lint will not invent a Rain API. A live Rain connector requires an official read endpoint or feed, market identifiers, market lifecycle/status fields, outcome prices or probabilities, volume/liquidity fields where available, source timestamps, resolution metadata, rate-limit guidance, and authentication requirements if the feed is not public.

## Deployment gate

Software CI passing is not the same as a production pilot. Before external pilot claims, deploy the web app, PostgreSQL database, and worker with production secrets; run migrations; verify `/ready`; then run the worker soak procedure and retain source, worker, webhook, Guard, Watch, and signal metrics for the pilot report.
