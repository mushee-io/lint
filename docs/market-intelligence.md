# Market Intelligence — Milestone 2

Market Intelligence turns persisted prediction-market data into an operator-facing quality and risk assessment.

## Endpoint

```http
GET /api/v1/markets/:id/intelligence
```

The endpoint analyzes an already-ingested market and returns a 0–100 score, grade, status, confidence, seven evidence-backed dimensions, operator signals, recommended actions, duplicate candidates, and canonical-event context.

## Dimensions

1. **Market structure** — objective/measurable wording and subjective-language detection.
2. **Resolution readiness** — resolution-source quality plus settlement/edge-case language.
3. **Data integrity** — market freshness, upstream source freshness, and consecutive source failures.
4. **Liquidity support** — protocol-native liquidity/volume context. Values are never represented as directly comparable across protocols.
5. **Market history** — persisted probability observations and large single-observation moves.
6. **Event graph context** — canonical event membership, protocol coverage, duplicate candidates, and possible related-event links.
7. **Cross-protocol consensus** — consumes the latest persisted consensus snapshot. `INSUFFICIENT_DATA` stays explicit and is never presented as consensus.

## Output semantics

Top-level status:

- `STRONG` — evidence is broadly healthy and the weighted score is high.
- `WATCH` — usable market, but material review items remain.
- `WEAK` — core resolution or data-integrity evidence is failing, or the total score is poor.

Grades map to the 0–100 score:

- A: 90–100
- B: 80–89
- C: 70–79
- D: 60–69
- F: below 60

`confidence` measures evidence coverage, not outcome certainty. It increases when Market Lint has resolution-source data, multiple snapshots, source-state evidence, liquidity/volume evidence, canonical-event context, and a consensus snapshot.

## Example

```json
{
  "data": {
    "marketId": "...",
    "protocol": "Polymarket",
    "score": 84,
    "grade": "B",
    "status": "STRONG",
    "confidence": 90,
    "resolutionReadiness": "READY",
    "dimensions": [
      {
        "code": "DATA_INTEGRITY",
        "score": 100,
        "status": "PASS"
      }
    ],
    "signals": [],
    "operatorActions": [],
    "algorithmVersion": "market-intelligence-v1"
  }
}
```

## Important boundaries

- Market Intelligence does not predict whether YES or NO will win.
- A probability move is evidence to inspect, not proof of manipulation.
- Liquidity values remain protocol-native and are not treated as cross-protocol equivalent units.
- `INSUFFICIENT_DATA` remains the correct consensus state until at least two independent protocol inputs support the same canonical event.
- Duplicate/event matching remains conservative; medium-confidence relationships are review candidates rather than automatically merged consensus groups.
