# Cross-Protocol Consensus & Confidence Engine

Milestone 7 upgrades Market Lint consensus from a simple cross-venue weighted probability into an auditable, uncertainty-aware intelligence product.

## What it does

For each confirmed Universal Event Graph cluster, Market Lint:

1. gathers the latest usable probability from every persisted market;
2. groups markets by protocol so one venue cannot gain extra voting power simply by listing many copies of the same event;
3. estimates operational reliability from source health, market freshness, and persisted history depth;
4. calculates a venue-balanced probability using reliability-aware weights and deliberately capped liquidity influence;
5. measures pairwise cross-protocol divergence;
6. decomposes confidence into explicit components rather than returning an unexplained label;
7. persists every observation into `ConsensusSnapshot` for history and trend analysis;
8. emits durable `CONSENSUS_DIVERGENCE` Watch signals when a watched event escalates into high or critical cross-protocol disagreement.

The algorithm version is `consensus-v3-confidence`.

## Readiness boundary

Market Lint only returns `READY` when at least two distinct protocols have fresh or aging usable probability data for the confirmed graph cluster.

- `READY` — at least two independent protocol inputs are usable.
- `STALE` — the graph contains at least two protocols, but fewer than two currently have usable fresh/aging probability data.
- `INSUFFICIENT_DATA` — fewer than two independent protocols are represented.

A single venue is never presented as cross-protocol consensus.

## Confidence decomposition

The 0–100 event confidence score is composed from:

- **Agreement — 30%**: penalizes probability dispersion across protocols.
- **Source reliability — 20%**: observed upstream source health and consecutive failures.
- **Freshness — 15%**: current persisted market freshness.
- **Protocol diversity — 15%**: number of independent protocol inputs.
- **Liquidity support — 10%**: total observed liquidity with logarithmic/capped influence.
- **History depth — 10%**: persisted snapshot depth available to support the observation.

The API returns both the total and each component. Confidence is labeled `HIGH`, `MEDIUM`, or `LOW`, but the numeric decomposition remains the primary evidence.

## Divergence

Pairwise protocol gaps are classified as:

- `< 7%`: `NONE`
- `7–12%`: `LOW`
- `12–20%`: `MEDIUM`
- `20–30%`: `HIGH`
- `>= 30%`: `CRITICAL`

These are disagreement signals, not claims that a market is manipulated or wrong.

High/critical divergence on watched event clusters creates `CONSENSUS_DIVERGENCE` risk signals. Alerts are escalation-based and deduplicated so an unchanged disagreement does not create a new incident every worker cycle.

## Protocol reliability

`GET /api/v1/protocols/:protocol/reputation` now returns persisted operational reliability rather than the old fixture-backed reputation result. The response includes:

- total reliability score;
- source-health score;
- freshness score;
- history-depth score;
- observed market count;
- fresh vs stale/unknown market count;
- observed source names;
- confidence based on sample size.

This is explicitly an operational data-quality measure. It is not a moral, governance, solvency, or settlement-authority rating.

## APIs

```text
GET /api/v1/events/:id/consensus
GET /api/v1/events/:id/divergence
GET /api/v1/protocols/:protocol/reputation
```

The consensus endpoint returns the current result, 50 persisted historical snapshots, graph-cluster membership, protocol inputs, confidence decomposition, divergence evidence, and the change from the previous ready observation when available.

## Operator workspace

```text
/protocol/consensus
```

The control center shows:

- ready-event count;
- high-divergence count;
- average event confidence;
- observed protocol count;
- latest probability and dispersion per event;
- confidence components;
- high/critical disagreement count;
- operational protocol-reliability cards.

## Weighting design

Consensus is intentionally venue-balanced. Markets are first aggregated within each protocol, then protocol-level probabilities are weighted primarily by reliability. Liquidity only has a bounded secondary effect. This prevents a single highly liquid venue, or a venue with many duplicate listings, from mechanically becoming "truth."

Market Lint remains an intelligence layer. It does not settle markets and does not designate any protocol as authoritative.
