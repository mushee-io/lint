# Rain pilot package

Status: `READY_FOR_ACCESS / NOT CONNECTED`

## Pilot thesis

Market Lint can sit beside Rain's market creation and monitoring workflow as a read-only intelligence layer: lint proposed market wording before launch, watch live markets for freshness/risk changes, surface explainable signals, and produce resolution-readiness evidence without becoming settlement authority.

## Proposed integration

- **Pre-listing:** Rain sends proposed market metadata to `POST /api/v1/guard` and receives `ALLOW`, `REVIEW`, or `BLOCK` with reasons.
- **Live monitoring:** approved Rain market IDs are registered with Watch and evaluated from persisted snapshots.
- **Signals:** risk/freshness/resolution events are delivered through signed webhooks.
- **Review:** Rain operators can label outputs as expected, useful, false positive, false negative, agree, disagree, or uncertain.
- **Pilot report:** Market Lint produces measured JSON/HTML reports from durable pilot records.

## Access needed from Rain

A live connector requires an official read endpoint/feed or indexer interface plus field definitions for market ID, title, outcomes/probabilities, status, close time, source timestamp, resolution criteria/source, and liquidity/volume where available. Rain should also provide authentication and rate-limit requirements if the feed is not public.

## Success criteria

- Live Rain markets ingest without synthetic fallback.
- Source timestamps and provenance are retained.
- Guard and Watch consume persisted Rain state.
- Signed webhook delivery is verified by a Rain-controlled receiver.
- No cross-tenant data exposure.
- Pilot metrics and feedback are reportable from real activity.

Until those access requirements are supplied, Rain remains `BLOCKED_PENDING_ACCESS`; the repository must not claim a live Rain integration.
