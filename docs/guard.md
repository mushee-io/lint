# Market Lint Guard

Guard is the pre-listing market quality and risk gate for prediction-market operators.

## Endpoint

`POST /api/v1/guard`

Authenticated pilot clients should send an API key with `guard:write`. The endpoint also supports the existing sandbox/no-auth path for development.

### Request

```json
{
  "title": "Will Bitcoin close above $150,000 on December 31, 2026?",
  "description": "Resolve YES if the Coinbase BTC-USD spot price is above 150000 USD at the cutoff. Resolve NO otherwise, according to the named source.",
  "outcomes": ["YES", "NO"],
  "resolutionSource": "https://www.coinbase.com/price/bitcoin",
  "closeTime": "2026-12-31T23:59:59Z"
}
```

### Response

Guard returns a deterministic decision and the evidence used to reach it:

- `ALLOW` — all mandatory checks pass and the score clears the automatic-listing threshold.
- `REVIEW` — the market may be listable, but one or more checks require operator review.
- `BLOCK` — the construction contains critical or multiple mandatory failures.

The response includes:

- `marketLintScore` — 0–100 weighted market-quality score.
- `confidence` — confidence in the deterministic evaluation.
- `risks` — duplicate, ambiguity, resolution, and manipulation risk levels.
- `checks` — per-rule status, score, weight, evidence, and repair suggestion.
- `reasons` — the most important decision reasons.
- `warnings` — all non-passing check messages.
- `suggestions` — concrete changes an operator can make before resubmitting.
- `algorithmVersion` — currently `guard-v2`.

## Guard v2 checks

1. **Title clarity** — detects short/unclear questions and subjective wording.
2. **Observation deadline** — requires a valid future `closeTime` and flags vague time language.
3. **Resolution source** — requires a stable public HTTPS source and rejects private/local hosts.
4. **Outcome completeness** — validates unique and complete outcome sets.
5. **Objective resolvability** — checks that the outcome is observable rather than subjective.
6. **Settlement criteria** — evaluates whether the description contains enough dispute-resolution context.
7. **Duplicate market** — compares against persisted markets and routes materially similar markets to review.

## Decision policy

Guard is intentionally conservative. A single ordinary warning does not necessarily block a market. Critical failures, very low scores, or several mandatory failures produce `BLOCK`; otherwise unresolved failures produce `REVIEW`.

Guard does not use an LLM in Milestone 1. That makes the initial policy deterministic, testable, explainable, and safe to use as a pre-listing gate. AI review is a later layer and must not silently override Guard's deterministic evidence.
