# Rain integration

Status: **PENDING RAIN ACCESS**. The Market Lint integration package uses the standardized `MarketAdapter` interface and supports Guard, Watch, webhook signing, and normalized market mapping.

## Contract assumptions

Rain should supply a stable external market ID, title, outcomes with probabilities, lifecycle status, close time, resolution criteria/source, liquidity, and volume. Missing data is explicitly marked unavailable rather than inferred.

## First integration

1. Map Rain fields to the normalized `Market` contract.
2. Call `POST /api/v1/guard` before launch.
3. Register each live market with `POST /api/v1/watch`.
4. Verify HMAC webhook signatures and deduplicate delivery IDs.
5. Call resolution readiness before settlement.

See `/demo/rain` and `/protocol/demo` for the mock flow. No Rain endpoint is called until Rain provides access.
