# Market Lint

An editorial-quality intelligence layer for prediction markets. Submit market wording and receive a structured report on resolution clarity, ambiguity, improvement opportunities, and source quality.

## Run locally

```bash
npm install
copy .env.example .env
npm run dev
```

Open `http://localhost:3000`. The app works without an API key using a deterministic report fixture. Set `OPENAI_API_KEY` to receive a live structured response from OpenAI.

## Database

Postgres and Prisma are configured in `prisma/schema.prisma`. Start Postgres with `docker compose up db`, then run `npx prisma migrate dev` after copying `.env.example`.

## Docker

```bash
docker compose up --build
```

## Quality checks

```bash
npm run lint
npm run test
npm run build
```

## Market Graph demo

Open `/explore` to inspect seeded normalized markets across Mock, Rain, and Generic adapters. The Ethereum fixtures demonstrate a canonical event with related-but-not-identical markets. Use `POST /api/v1/search`, `/api/v1/duplicates`, or `/api/v1/analyze` for the programmatic demo. The OpenAPI description is available at `/openapi.json`; the small SDK source is in `packages/sdk`.

`embedding` is represented as a pgvector column in the production schema. Demo semantic search uses transparent token similarity so it runs without external infrastructure; a production ingestion worker can populate OpenAI embeddings and query the same column.

## Protocol Intelligence demo

Visit `/protocol` for the infrastructure dashboard and `/protocol/demo` for the Rain simulation. The simulator can trigger deterministic whale-trade, liquidity-exit, and volume-burst checks for the seeded `rain-eth-10k` market. Protocol endpoints include `POST /api/v1/guard`, `POST /api/v1/watch`, `GET /api/v1/watch/:marketId`, `GET /api/v1/events/:id/divergence`, and `GET /api/v1/markets/:id/resolution-readiness`.

The demo intentionally keeps watch state and webhook delivery simulation in memory. The Prisma schema includes the production persistence models for snapshots, organizations/API keys, risk configurations, resolution sources, and webhook subscriptions/deliveries.
