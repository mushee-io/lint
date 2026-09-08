import crypto from "node:crypto";
import { Market } from "@/lib/market-types";
import { scoreMarket } from "@/lib/market-score";

type Raw = {
  id: string;
  question?: string;
  description?: string;
  outcomes?: string | unknown[];
  outcomePrices?: string | unknown[];
  liquidity?: string | number;
  volume?: string | number;
  endDate?: string;
  resolutionSource?: string;
  category?: string;
  active?: boolean;
  closed?: boolean;
  slug?: string;
  createdAt?: string;
  updatedAt?: string;
};

const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function array(value?: string | unknown[]) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function normalizePolymarket(raw: Raw): Market {
  const outcomes = array(raw.outcomes).map(String);
  const prices = array(raw.outcomePrices).map(number);
  const title = raw.question ?? `Polymarket market ${raw.id}`;
  const market = {
    id: `polymarket-${raw.id}`,
    externalId: raw.id,
    protocol: "Polymarket",
    chain: "Polygon",
    title,
    description: raw.description ?? "",
    outcomes,
    category: raw.category ?? "Uncategorized",
    tags: ["live", "polymarket"],
    createdAt: raw.createdAt ?? new Date().toISOString(),
    closeTime: raw.endDate ?? "",
    resolutionTime: raw.endDate ?? "",
    resolutionSource: raw.resolutionSource ?? "UNAVAILABLE",
    status: (raw.closed ? "RESOLVED" : raw.active ? "OPEN" : "CLOSED") as Market["status"],
    marketUrl: `https://polymarket.com/event/${raw.slug ?? raw.id}`,
    creator: "UNAVAILABLE",
    liquidity: number(raw.liquidity),
    volume: number(raw.volume),
    prices,
    canonicalEventId: "external-unassigned",
  };
  return { ...market, score: scoreMarket(market) };
}

export function polymarketRawHash(raw: Raw) {
  return crypto.createHash("sha256").update(JSON.stringify(raw)).digest("hex");
}

export async function fetchPolymarketRecords(limit = 25) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://gamma-api.polymarket.com/markets?limit=${Math.min(Math.max(limit, 1), 100)}`, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "MarketLint/0.1" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Polymarket Gamma returned ${response.status}`);
    const raw = (await response.json()) as Raw[];
    const retrievedAt = new Date();
    return {
      source: "polymarket-gamma",
      retrievedAt,
      records: raw.map((item) => ({
        raw: item,
        market: normalizePolymarket(item),
        rawPayloadHash: polymarketRawHash(item),
        sourceTimestamp: item.updatedAt ? new Date(item.updatedAt) : null,
      })),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPolymarketMarkets(limit = 10) {
  const batch = await fetchPolymarketRecords(limit);
  return {
    source: "LIVE / Polymarket Gamma API",
    retrievedAt: batch.retrievedAt.toISOString(),
    markets: batch.records.map((record) => record.market),
  };
}
