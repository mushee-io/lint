# Universal Event Graph — Milestone 6

Market Lint's Universal Event Graph maps prediction-market contracts from multiple protocols onto durable canonical real-world events without pretending uncertain matches are identical.

## Matching policy

The deterministic matcher normalizes common market aliases such as BTC/Bitcoin and ETH/Ethereum, numeric magnitudes such as `100k`/`100000`, punctuation, casing, and U.S./US variants. It separately checks:

- lexical/topic overlap,
- numeric and time conditions,
- negation,
- directional threshold semantics such as above vs below.

A high-confidence equivalent can be automatically attached to an existing canonical event. Lower-confidence equivalents are persisted as `POSSIBLE_SAME_EVENT` for human review. Markets that share a subject but differ in threshold, year, polarity, or condition can be persisted as `RELATED_EVENT` instead of being merged.

Market Lint does not use `RELATED_EVENT` or `POSSIBLE_SAME_EVENT` relationships as consensus inputs.

## Relationship lifecycle

The operator review lifecycle is:

```text
POSSIBLE_SAME_EVENT
  -> SAME_EVENT_CONFIRMED
  -> RELATED_EVENT
  -> REJECTED
```

The available review decisions are:

```text
CONFIRM_SAME_EVENT
MARK_RELATED
REJECT
```

Every decision is written to `AuditLog` with the actor, previous relationship type, resulting relationship type, confidence, graph version, and optional note.

## Graph-aware consensus

A `SAME_EVENT_CONFIRMED` edge joins canonical events into a confirmed event cluster. The production consensus worker (`consensus-v2-graph`) gathers fresh latest observations from every market in that confirmed cluster.

Consensus remains `INSUFFICIENT_DATA` unless at least two distinct protocols contribute usable fresh market observations. Related, rejected, and unreviewed possible matches are never included merely to manufacture cross-protocol consensus.

## APIs

Public persistent graph reads:

```text
GET /api/v1/events
GET /api/v1/events/:id
GET /api/v1/events/:id/graph
GET /api/v1/events/:id/consensus
```

Authenticated relationship review:

```text
GET  /api/v1/event-relationships
POST /api/v1/event-relationships/:id
```

Permissions:

- `graph:read` — list the relationship review queue.
- `graph:write` — confirm, mark related, or reject a relationship. User-based writes require ANALYST role or higher.

Example decision:

```json
{
  "decision": "CONFIRM_SAME_EVENT",
  "note": "Same candidate, office, election year, and resolution condition."
}
```

## Operator workspace

`/protocol/graph` shows:

- canonical-event count,
- possible-same-event review queue,
- confirmed graph links,
- related edges,
- recent multi-protocol events,
- source and target market/protocol context,
- authenticated relationship decision controls.

The dashboard is exposed only when `MARKET_LINT_PILOT_ORG_ID` is configured.

## Safety boundary

The graph is an intelligence abstraction. It does not mutate third-party prediction-market contracts, declare settlement outcomes, or treat semantic similarity as proof. Human-confirmed graph relationships affect Market Lint's consensus cluster only; source records and provenance remain unchanged.
