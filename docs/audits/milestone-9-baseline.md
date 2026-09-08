# Milestone 9 pilot-operations baseline

Audited 2026-09-08 against the current repository. This document does not certify pilot readiness.

## READY

- Apache-2.0 license, NOTICE, and brand notice are present.
- The application lint, current unit tests, and production build pass locally.
- Guard, Watch, graph, consensus, signals, and resolution readiness API routes compile and run for seeded fixtures.
- A read-only Polymarket Gamma API connector can fetch and normalize a bounded on-demand market list when its public endpoint is reachable.
- Rain integration documentation correctly states that Rain access is pending.

## PARTIALLY READY

- The SDK source defines core calls but has no package manifest, release artifact, or clean-consumer end-to-end test.
- The Polymarket connector normalizes upstream fields but does not persist records, track every field's provenance, schedule refreshes, or monitor source health.
- Demo protocol interfaces show the intended Guard/Watch flow but use in-memory fixture state.

## BLOCKED BY EXTERNAL ACCESS

- Rain integration requires Rain's endpoint, authentication method, official market schema, lifecycle/price feed, resolution events, webhook format, and rate-limit policy.
- A second independent legally usable live prediction-market source is not connected.
- Deployment, DNS, secrets, managed database, cache, queue, and external webhook destination access are not available in this repository context.

## MOCKED

- Rain, Generic, and Mock adapters; canonical event graph; risk snapshots; Watch state; signals; consensus; reputation; webhook behavior; and network dashboards are fixture or process-memory based.
- Demo routes are visibly labelled, but their source data is not pilot telemetry.

## BROKEN FOR PILOT PURPOSES

- No organization/API-key authentication or RBAC enforcement.
- No tenant isolation, audit log, feedback store, pilot model, pilot lifecycle, or pilot report generated from measured data.
- No durable worker/queue, ingestion retries, idempotency, freshness engine, webhook delivery/retry/replay, or authenticated streaming.
- No integration health, live data-quality, signal-review, false-positive, API performance, or cost metrics.

## UNUSED OR INCOMPLETE

- Prisma production-oriented models have no migrations, generated client usage, or database-backed handlers.
- Webhook signing helper and SDK source are not connected to a persistent operational implementation.

## Pilot conclusion

**NO-GO.** A first pilot must wait for the P0 work in `docs/audits/milestone-8-plan.md`: durable persistence, tenant isolation/authentication, ingestion/workers/freshness, reliable webhooks/streaming, at least two validated live sources, and measured end-to-end validation.
