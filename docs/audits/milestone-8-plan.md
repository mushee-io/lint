# Milestone 8 production-launch plan

Derived from `docs/audits/milestone-7-baseline.md` on 2026-09-08.

## P0 — blocks pilot or production

1. **Durable data plane.** Implement and migrate PostgreSQL persistence for normalized markets, provenance, snapshots, graph data, signals, organizations, and audit records. Current graph/risk/network behavior uses fixtures or process memory.
2. **Identity, authorization, and tenant isolation.** Implement API-key hash verification, organization scoping, RBAC, revocation/rotation, per-environment keys, and adversarial isolation tests. Current schema-only models do not enforce any access policy.
3. **Ingestion and workers.** Add scheduled/manual durable ingestion, idempotency, retries, freshness states, queue/worker health, and no-fabrication degradation behavior. Current Polymarket integration is on-demand only.
4. **Live validation coverage.** Add a legally usable second source, capture reproducible live snapshots/provenance, and measure normalization, grouping, duplicate, Guard, consensus, and risk behavior. No valid live accuracy results currently exist.
5. **Webhook/stream reliability.** Implement signed delivery with replay protection, retries, dead-letter handling, subscriptions, authorization, and durable event storage. Current webhooks are schema/helper-only and SSE is a one-response demo.
6. **Production readiness gates.** Implement `readiness`, `integrity`, migrations, backup/restore validation, and clean-install checks. Existing readiness endpoint reports demo mode.

## P1 — major security/reliability issues

- Source checker must use a server-side egress policy robust to redirects, DNS rebinding, response limits, and metadata endpoints.
- Add API input-size limits, request IDs, structured redacted logs, rate limits, quotas, contract tests, and dependency/security auditing.
- Persist provenance and normalization version for each live field; add freshness-aware consensus exclusions.
- Package and end-to-end test SDK/CLI against the frozen API contract.

## P2 — important after P0/P1

- Production dashboard empty/error/unauthorized states and truthful live-vs-demo labels.
- Rain and Arbitrum pilot packages/demos, only after their underlying integration boundaries work.
- Operations runbooks, status model, pilot reporting, and performance/load measurement.

## P3 — defer

- Marketing polish, new public explorer surfaces, speculative integrations, and nonessential visual redesigns.

## Launch rule

Do not deploy or label a release candidate until every P0 is demonstrably complete and P1 issues have an accepted mitigation. At present the correct recommendation is **NO-GO**.
