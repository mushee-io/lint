import crypto from "node:crypto";
import { Market } from "@/lib/market-types";
import { scoreMarket } from "@/lib/market-score";

type RawKalshiMarket = {
  ticker: string;
  event_ticker?: string;
  market_type?: string;
  title?: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  created_time?: string;
  updated_time?: string;
  open_time?: string;
  close_time?: string;
  expiration_time?: string;
  settlement_ts?: string;
  status?: string;
  result?: string;
  last_price_dollars?: string | number;
  yes_bid_dollars?: string | number;
  yes_ask_dollars?: string | number;
  liquidity_dollars?: string | number;
  volume_fp?: string | number;
  volume_24h_fp?: string | number;
  rules_primary?: string;
  rules_secondary?: string;
};

type RawKalshiResponse = { markets?: RawKalshiMarket[]; cursor?: string };

function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function probability(raw: RawKalshiMarket) {
  const last = finite(raw.last_price_dollars);
  if (last >= 0 && last <= 1 && raw.last_price_dollars !== undefined) return last;
  const bid = finite(raw.yes_bid_dollars);
  const ask = finite(raw.yes_ask_dollars);
  if (bid > 0 && ask > 0) return Math.min(1, Math.max(0, (bid + ask) / 2));
  if (bid > 0) return Math.min(1, Math.max(0, bid));
  if (ask > 0) return Math.min(1, Math.max(0, ask));
  return 0;
}

function marketStatus(value?: string): Market["status"] {
  if (value === "settled") return "RESOLVED";
  if (value === "closed") return "CLOSED";
  return "OPEN";
}

export function normalizeKalshi(raw: RawKalshiMarket): Market {
  const yesProbability = probability(raw);
  const description = [raw.subtitle, raw.rules_primary, raw.rules_secondary].filter(Boolean).join("\n\n");
  const market = {
    id: `kalshi-${raw.ticker}`,
    externalId: raw.ticker,
    protocol: "Kalshi",
    chain: "Offchain",
    title: raw.title || raw.subtitle || raw.ticker,
    description,
    outcomes: [raw.yes_sub_title || "YES", raw.no_sub_title || "NO"],
    category: raw.event_ticker || "Kalshi",
    tags: ["live", "kalshi"],
    createdAt: raw.created_time || raw.open_time || new Date().toISOString(),
    closeTime: raw.close_time || raw.expiration_time || "",
    resolutionTime: raw.settlement_ts || raw.expiration_time || raw.close_time || "",
    resolutionSource: raw.rules_primary ? "Kalshi market rules" : "UNAVAILABLE",
    status: marketStatus(raw.status),
    marketUrl: `https://kalshi.com/markets/${encodeURIComponent(raw.ticker)}`,
    creator: "Kalshi",
    liquidity: finite(raw.liquidity_dollars),
    volume: finite(raw.volume_fp),
    prices: [yesProbability, Math.max(0, 1 - yesProbability)],
    canonicalEventId: "external-unassigned",
  };
  return { ...market, score: scoreMarket(market) };
}

export function kalshiRawHash(raw: RawKalshiMarket) {
  return crypto.createHash("sha256").update(JSON.stringify(raw)).digest("hex");
}

export async function fetchKalshiRecords(limit = 25) {
  const safeLimit = Math.min(Math.max(limit, 1), 250);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const url = new URL("https://external-api.kalshi.com/trade-api/v2/markets");
    url.searchParams.set("limit", String(safeLimit));
    url.searchParams.set("status", "open");
    url.searchParams.set("mve_filter", "exclude");
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "MarketLint/0.1" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Kalshi API returned ${response.status}`);
    const payload = (await response.json()) as RawKalshiResponse;
    const retrievedAt = new Date();
    const markets = (payload.markets ?? []).filter((item) => !item.market_type || item.market_type === "binary").slice(0, safeLimit);
    return {
      source: "kalshi-public-rest",
      retrievedAt,
      records: markets.map((item) => ({
        raw: item,
        market: normalizeKalshi(item),
        rawPayloadHash: kalshiRawHash(item),
        sourceTimestamp: item.updated_time ? new Date(item.updated_time) : item.created_time ? new Date(item.created_time) : null,
      })),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchKalshiMarkets(limit = 10) {
  const batch = await fetchKalshiRecords(limit);
  return {
    source: "LIVE / Kalshi public REST API",
    retrievedAt: batch.retrievedAt.toISOString(),
    markets: batch.records.map((record) => record.market),
  };
}
