type JsonRecord = Record<string, unknown>;

const RAIN_PUBLIC_ENDPOINTS = [
  "https://prod-api.rain.one/pools/public-pools",
  "https://prod2-api.rain.one/pools/public-pools",
] as const;

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function firstString(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(millis);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }
  return "";
}

function extractPools(body: unknown): JsonRecord[] {
  const root = asRecord(body);
  if (!root) return [];
  const data = asRecord(root.data);
  const candidates = [data?.pools, data?.markets, root.pools, root.markets];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.map(asRecord).filter((value): value is JsonRecord => Boolean(value));
  }
  return [];
}

export type RainPartnerPayload = {
  externalId: string;
  title: string;
  description: string;
  outcomes: string[];
  closeTime: string;
  resolutionSource: string;
  probability?: number;
  volume: number;
  liquidity: number;
  status: "OPEN" | "CLOSED" | "RESOLVED";
};

export function normalizeRainPartnerMarket(market: JsonRecord): RainPartnerPayload {
  const poolData = asRecord(market.poolData) ?? {};
  const externalId = firstString(market, ["id", "_id", "contractAddress"]);
  const title = firstString(market, ["title", "question", "marketQuestion"]) || firstString(poolData, ["question", "title"]);
  const closeTime =
    toIso(market.endTime) ||
    toIso(market.endDate) ||
    toIso(market.closeTime) ||
    toIso(poolData.endDate) ||
    toIso(poolData.endTime);
  const probabilityValue = number(market.probability ?? market.yesProbability ?? poolData.probability ?? poolData.yesProbability);
  const statusText = firstString(market, ["status", "marketStatus"]).toUpperCase();
  const status: RainPartnerPayload["status"] = statusText === "RESOLVED" ? "RESOLVED" : statusText === "CLOSED" ? "CLOSED" : "OPEN";
  const resolutionSource =
    firstString(market, ["resolutionSource", "resolutionUrl", "sourceUrl"]) ||
    firstString(poolData, ["resolutionSource", "resolutionUrl", "sourceUrl"]);

  if (!externalId || !title) throw new Error("Rain market did not expose an id/title pair Market Lint can validate.");

  return {
    externalId,
    title,
    description: firstString(market, ["description", "marketDescription"]) || firstString(poolData, ["description"]),
    outcomes: ["YES", "NO"],
    closeTime,
    resolutionSource,
    ...(probabilityValue >= 0 && probabilityValue <= 1 ? { probability: probabilityValue } : {}),
    volume: number(market.totalVolume ?? poolData.totalVolumeUSD ?? 0),
    liquidity: number(market.totalLiquidity ?? poolData.totalLiquidityUSD ?? 0),
    status,
  };
}

export async function fetchRainPartnerMarket(limit = 5) {
  const failures: string[] = [];
  const safeLimit = Math.min(Math.max(limit, 1), 25);

  for (const base of RAIN_PUBLIC_ENDPOINTS) {
    const endpoint = `${base}?limit=${safeLimit}`;
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json", "User-Agent": "MarketLint/0.1" },
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        failures.push(`${endpoint} -> HTTP ${response.status}`);
        continue;
      }
      const body = await response.json();
      const pools = extractPools(body);
      for (const pool of pools) {
        try {
          const payload = normalizeRainPartnerMarket(pool);
          return { source: endpoint, retrievedAt: new Date().toISOString(), payload };
        } catch {
          // Keep looking for the first usable public market.
        }
      }
      failures.push(`${endpoint} -> no usable public market in response`);
    } catch (error) {
      failures.push(`${endpoint} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(`Rain public market fetch failed. ${failures.join(" | ")}`);
}
