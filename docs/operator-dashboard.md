# Operator Dashboard — Milestone 4

Market Lint's operator dashboard turns Guard, Market Intelligence, and the grounded reviewer into a daily review workflow for prediction-market operators.

## Surfaces

### `/protocol/operator`

The operator queue ranks recently ingested markets by intelligence risk. `WEAK` markets appear first, followed by `WATCH`, then `STRONG`. Within each group, lower-scoring markets appear first.

Filters:

- market title search
- protocol
- freshness
- intelligence status

Queue metrics:

- markets currently shown
- weak markets
- watch markets
- freshness-risk markets
- undecided markets for the configured pilot organization

Opening a queue row takes the operator to the market workspace.

### `/protocol/markets/:id`

The market workspace combines:

- Market Lint intelligence score, grade, status, and confidence
- all seven deterministic intelligence dimensions
- per-dimension evidence
- deterministic grounded reviewer verdict and findings
- suggested market rewrite where justified by existing evidence
- persisted market metadata and recent snapshots
- tenant-scoped operator decision history
- tenant-scoped authenticated AI-review history
- interactive operator actions

Opening a market workspace never triggers a paid AI call. The initial reviewer shown on the page is deterministic and grounded in persisted Market Intelligence.

## Operator decisions

Endpoint:

```http
POST /api/v1/markets/:id/decision
Authorization: Bearer <MARKET_LINT_API_KEY>
Content-Type: application/json
```

The API key must include:

```text
operator:decision
```

Body:

```json
{
  "decision": "APPROVE",
  "note": "Resolution source and market wording reviewed."
}
```

Allowed decisions:

- `APPROVE`
- `HOLD`
- `REJECT`

Every accepted decision is persisted to `AuditLog` with the operator organization and actor plus an immutable snapshot of the current Market Intelligence score, grade, status, confidence, resolution-readiness state, and algorithm version.

The API does not mutate or delete the underlying third-party market. It records Market Lint's operator workflow decision.

## AI review controls

The workspace can explicitly request either:

- grounded deterministic review — no provider credits
- provider-backed AI review — requires `intelligence:review` permission and a configured provider

The browser never receives a server-side Market Lint credential. An operator enters an API key into the action panel and it is sent only with the requested API call.

## Tenant boundaries

Decision and AI-review history shown in the dashboard is scoped to `MARKET_LINT_PILOT_ORG_ID`. If no pilot organization is configured, operator history is hidden rather than displaying cross-tenant audit data.

API writes always derive organization scope from the authenticated API key or authenticated organization membership.

## Decision philosophy

Operator decisions are intentionally separate from Market Lint's deterministic intelligence output:

- Market Intelligence says what the evidence indicates.
- The grounded reviewer explains that evidence.
- The operator makes the business/listing decision.

An operator cannot overwrite the underlying Market Lint score by clicking `APPROVE` or `REJECT`.

## Validation

The existing Market Intelligence CI smoke now also proves:

- unauthenticated users cannot record decisions
- keys without `operator:decision` cannot record decisions
- unsupported decision values are rejected
- accepted decisions are persisted with the correct tenant and market

Milestone 4 therefore adds a usable operator workflow without weakening the deterministic intelligence or tenant-isolation boundaries built in earlier milestones.
