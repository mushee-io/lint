# Market Lint Partner Pilot

Milestone 9 turns Market Lint from a finished core product into a measured partner integration. The partner workflow is deliberately evidence-first: Market Lint records what it actually analyzed, watched, alerted on, and how the partner responded. It does not claim a live partnership until a real operator supplies a feed and uses the integration.

## 1. Create the tenant and pilot

Create the organization/protocol through the existing bootstrap/admin flow, then create a Pilot through `POST /api/v1/pilots`.

Activate it with an owner/admin credential:

```http
POST /api/v1/pilots/:id/activate
```

Activation:

- moves the pilot into `PILOT_ACTIVE`;
- applies the PILOT tenant policy;
- issues a protocol-bound live API key if one does not already exist;
- returns the new live secret once only;
- scopes the partner key to Guard, Watch, incidents, feedback, webhooks, partner feed ingestion, reviewer access, and pilot reads.

If a live key already exists, activation is idempotent and does not expose its old secret. Use key rotation instead.

## 2. Connect the partner market feed

The generic partner feed endpoint is:

```http
POST /api/v1/partner/markets
Authorization: Bearer ml_live_...
Content-Type: application/json
```

```json
{
  "autoWatch": true,
  "markets": [
    {
      "externalId": "market-123",
      "title": "Will BTC close above $150,000 on December 31, 2026?",
      "description": "Resolves YES using the stated source at the stated UTC deadline.",
      "outcomes": ["YES", "NO"],
      "probability": 0.62,
      "liquidity": 125000,
      "volume": 800000,
      "resolutionSource": "https://example.com/resolution-policy",
      "closeTime": "2026-12-31T23:59:59Z",
      "status": "OPEN",
      "updatedAt": "2026-09-09T07:00:00Z"
    }
  ]
}
```

The adapter accepts normalized partner JSON, persists provenance and snapshots using `partner-feed-v1`, resolves the canonical event, updates source health, and by default places every ingested market under Watch. Batches are capped at 500 markets.

The source is isolated per partner Protocol as `partner-<protocol-id>` so source health cannot be confused with Polymarket, Manifold, or another partner.

## 3. Put Guard in market creation

Before the operator lists a market:

```http
POST /api/v1/guard
```

Authenticated pilot Guard calls record their response time in `PilotMetric`. The persisted Guard evaluation continues to return the deterministic `ALLOW`, `REVIEW`, or `BLOCK` decision, score, evidence, warnings, and suggestions.

A partner should treat `REVIEW` as a human-review request, not an automatic rejection.

## 4. Watch live markets

Partner feed ingestion uses `autoWatch: true` by default. Watch baselines are created on first registration and all existing Watch v2 surveillance runs through the normal worker and webhook system.

The partner can also register a market explicitly through `POST /api/v1/watch`.

## 5. Configure the webhook

```http
POST /api/v1/webhooks
```

The endpoint secret is shown once. Production URLs must use HTTPS. Deliveries are signed, retried, deduplicated, observable through webhook stats, and can be replayed after remediation.

## 6. Collect partner feedback

Operators can label Guard reviews or risk signals through:

```http
POST /api/v1/feedback
```

Supported labels include `FALSE_POSITIVE`, `FALSE_NEGATIVE`, `USEFUL`, `EXPECTED`, `AGREE`, `DISAGREE`, and `UNCERTAIN`.

The pilot report computes the false-positive rate only over feedback the partner actually submitted. Unlabeled alerts are not silently treated as correct.

## 7. Measure response time

Market Lint records:

- authenticated Guard response time;
- partner-feed ingestion response time;
- time from incident detection to partner `ACKNOWLEDGE`;
- time from incident detection to partner `RESOLVE`.

These measurements are persisted and surfaced in the pilot report. Missing measurements remain `null` / `NO DATA`.

## 8. Pilot status and report

```http
GET /api/v1/pilots/:id/status
GET /api/v1/pilots/:id/report
GET /api/v1/pilots/:id/report?generate=1
```

The status endpoint exposes the integration checklist:

- pilot active;
- live key issued;
- partner feed observed successfully;
- Watch active;
- webhook configured;
- feedback received;
- pilot report generated.

The generated JSON+HTML impact report includes:

- markets observed;
- Guard decision distribution and intervention count;
- active watched markets;
- signal type/severity distribution;
- high-severity incidents;
- webhook delivery success;
- partner-labeled false positives/false negatives;
- average Guard latency;
- average feed-ingestion latency;
- average incident acknowledgement/resolution latency.

Guard interventions and risk signals are operational findings. They must not be described as proof that Market Lint prevented manipulation or financial harm unless the partner can independently establish that outcome.

## Rain and other operators

Rain remains `BLOCKED_PENDING_ACCESS` until an official feed/API/schema or partner-provided market payload is available. The generic partner endpoint means Market Lint does not need to wait for a bespoke adapter: any operator can begin a measured pilot by posting its market records in this contract.
