# Milestone 7 baseline audit

Audited 2026-09-08. This is a repository inspection, not a pilot certification.

## Working

- Next.js application builds, lints, and unit tests run locally.
- Versioned API routes compile.
- Deterministic Market Lint score, Guard, risk, graph, and consensus functions run against seeded fixtures.
- Read-only Polymarket Gamma connector is implemented with an upstream timeout and explicit HTTP failure response.
- Static/demo Explorer, Terminal, protocol dashboard, network demo, and Rain demo routes render.

## Partially working

- Polymarket normalization maps fields returned by the upstream endpoint, but does not persist them, record provenance, ingest on a schedule, or supply a reproducible validation snapshot.
- API documentation and SDK source exist, but SDK packaging/end-to-end consumer testing is absent.
- Prisma includes models for production concepts, but migrations, generated client, and database-backed handlers are absent.
- Stream returns a single SSE event response; it is not a durable subscription/replay system.

## Mocked or demo-only

- Market Graph, canonical events, Rain/Generic/Mock adapters, risk signals, consensus, protocol reputation, monitoring state, and webhook behavior use fixture or in-memory data.
- `READY` endpoint reports `mode: demo`.
- Dashboard metrics include seeded/demo values and need source labels before a pilot.

## Not implemented

- A second live data source and any durable ingestion pipeline or worker queue.
- Persistence, idempotent ingestion, freshness tracking, and historical snapshots.
- Authentication, API-key verification, RBAC, tenant isolation, quotas, billing, audit logging, and secret encryption.
- Outbound webhook delivery/retries/dead-letter queue and signed receipts.
- CLI, adapter SDK package, contract tests, load tests, tenant tests, integration tests, and security test suite.
- Live canonical-event/duplicate/Guard/consensus evaluation dataset and measured accuracy results.
- Pilot workspace, analytics/reporting, automated fail-fast production config, runbooks, and CI quality gates.

## Broken or misleading if presented as production

- Production-facing claims in milestone prompts exceed the implemented code. The system must not be called production-grade or pilot-ready.
- Fixture-derived consensus and risk output must not be presented as live intelligence.

## Demo-assumption inventory

- `src/lib/fixtures.ts`, `src/lib/graph.ts`, `src/lib/risk.ts`, and `src/lib/network.ts` are core fixture dependencies.
- `src/adapters/mock`, `src/adapters/rain`, and `src/adapters/generic` are fixture adapters.
- `/protocol/demo`, `/demo/network`, and the Rain adapter are explicitly demo/mock; this is acceptable only beneath demo namespaces.
- `src/integrations/polymarket.ts` is the sole real-source connector. It uses a timeout intentionally; it is not a simulation.
