# Arbitrum ecosystem pilot package

## Positioning

**One intelligence layer for every prediction market on Arbitrum.**

Market Lint is designed to provide shared market-quality, risk, consensus, provenance, and resolution-readiness infrastructure to prediction-market protocols rather than compete with them for trading volume.

## Pilot scope

1. Onboard one or more Arbitrum prediction-market protocols as separate tenant-scoped protocol workspaces.
2. Normalize live markets into the Market Lint market/event graph.
3. Run Guard before market creation or listing changes.
4. Run Watch continuously on selected markets.
5. Track data freshness, risk signals, canonical-event relationships, and resolution readiness.
6. Deliver signed alerts to protocol teams.
7. Aggregate ecosystem metrics only from real persisted activity and label unavailable coverage as `NO DATA`.

## Existing evidence

The current infrastructure already supports durable PostgreSQL state, scoped API keys, organization isolation, persistent Guard/Watch/signals, source freshness, webhooks, pilot metrics, feedback, and reports. Public live-source validation is separate from any claim of an Arbitrum protocol partnership.

## Ecosystem success measures

- protocols integrated
- live markets monitored
- percentage of source data fresh
- Guard review/block rate
- Watch signals reviewed
- false-positive and false-negative feedback
- webhook delivery success
- resolution-readiness warnings surfaced before settlement
- cross-protocol canonical events with sufficient data for consensus

## Boundary

Market Lint is intelligence infrastructure, not a settlement oracle or trading venue. Ecosystem or partner names must not be represented as live integrations until their feeds are actually connected and validated.
