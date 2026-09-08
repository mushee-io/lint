import crypto from "node:crypto";
import { Market } from "@/lib/market-types";
import { scoreMarket } from "@/lib/market-score";

type Raw = {
  id: string;
  question?: string;
  outcomeType?: string;
  probability?: number;
  totalLiquidity?: number;
  volume?: number;
  isResolved?: boolean;
  resolution?: string;
  resolutionTime?: number;
  closeTime?: number;
  createdTime?: number;
  lastUpdatedTime?: number;
  url?: string;
  creatorUsername?: string;
  token?: string;
};

function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value?: number) {
  if (!value || !Number.isFinite(value)) return "";
  return new Date(value).toISOString();
}

export function normalizeManifold(raw: Raw): Market {
  const probability = Math.min(1, Math.max(0, finite(raw.probability)));
  const title = raw.question ?? `Manifold market ${raw.id}`;
  const closeTime = iso(raw.closeTime);
  const resolved = raw.isResolved === true;
  const closed = !resolved && raw.closeTime ? raw.closeTime <= Date.now() : false;
  const market = {
    id: `manifold-${raw.id}`,
    externalId: raw.id,
    protocol: "Manifold",
    chain: "Offchain",
    title,
    description: "",
    outcomes: ["YES", "NO"],
    category: "Manifold",
    tags: ["live", "manifold", raw.token?.toLowerCase()].filter(Boolean) as string[],
    createdAt: iso(raw.createdTime) || new Date().toISOString(),
    closeTime,
    resolutionTime: iso(raw.resolutionTime) || closeTime,
    resolutionSource: "UNAVAILABLE",
    status: (resolved ? "RESOLVED" : closed ? "CLOSED" : "OPEN") as Market["status"],
    marketUrl: raw.url ?? `https://manifold.markets/market/${raw.id}`,
    creator: raw.creatorUsername ?? "UNAVAILABLE",
    liquidity: finite(raw.totalLiquidity),
    volume: finite(raw.volume),
    prices: [probability, 1 - probability],
    canonicalEventId: "external-unassigned",
  };
  return { ...market, score: scoreMarket(market) };
}

export function manifoldRawHash(raw: Raw) {
  return crypto.createHash("sha256").update(JSON.stringify(raw)).digest("hex");
}

export async function fetchManifoldRecords(limit = 25) {
  const requested = Math.min(Math.max(limit * 3, 50), 1000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`https://api.manifold.markets/v0/markets?limit=${requested}&sort=updated-time&order=desc`, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "MarketLint/0.1" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Manifold API returned ${response.status}`);
    const raw = (await response.json()) as Raw[];
    const retrievedAt = new Date();
    const binary = raw.filter((item) => item.outcomeType === "BINARY").slice(0, Math.min(Math.max(limit, 1), 1000));
    return {
      source: "manifold-v0",
      retrievedAt,
      records: binary.map((item) => ({
        raw: item,
        market: normalizeManifold(item),
        rawPayloadHash: manifoldRawHash(item),
        sourceTimestamp: item.lastUpdatedTime ? new Date(item.lastUpdatedTime) : item.resolutionTime ? new Date(item.resolutionTime) : item.createdTime ? new Date(item.createdTime) : null,
      })),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchManifoldMarkets(limit = 10) {
  const batch = await fetchManifoldRecords(limit);
  return {
    source: "LIVE / Manifold v0 API",
    retrievedAt: batch.retrievedAt.toISOString(),
    markets: batch.records.map((record) => record.market),
  };
}
