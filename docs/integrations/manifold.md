# Manifold integration

Status: `LIVE_READ_ONLY`

Market Lint reads public binary markets from Manifold's v0 API at `api.manifold.markets` without authentication. The connector normalizes market identity, YES/NO probability, liquidity, volume, lifecycle state, source timestamps, provenance hashes, and freshness into the shared Market Lint persistence model.

The upstream API is described by Manifold as alpha, so this connector is treated as an independently monitored source rather than a guaranteed dependency. Source failures are recorded in `DataSourceState` and are never replaced by demo data.

Market Lint does not use Manifold API data to train commercial AI/ML models. Any future use outside the current integration and analytics purpose must be reviewed against Manifold's then-current API terms and licensing requirements.
