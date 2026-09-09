import { fetchKalshiMarkets } from "@/integrations/kalshi";
import { fetchManifoldMarkets } from "@/integrations/manifold";
import { fetchPolymarketMarkets } from "@/integrations/polymarket";
import { canonicalTitleSimilarity } from "@/lib/canonical";
import { Market } from "@/lib/market-types";
import { scoreMarket } from "@/lib/market-score";

export type PublicSourceName = "Polymarket" | "Manifold" | "Kalshi";
export type PublicSourceStatus = {
  protocol: PublicSourceName;
  status: "LIVE" | "UNAVAILABLE";
  source: string;
  retrievedAt: string | null;
  marketCount: number;
  error: string | null;
};

const FETCHERS: Array<{ protocol: PublicSourceName; fetcher: (limit: number) => Promise<{ source: string; retrievedAt: string; markets: Market[] }> }> = [
  { protocol: "Polymarket", fetcher: fetchPolymarketMarkets },
  { protocol: "Manifold", fetcher: fetchManifoldMarkets },
  { protocol: "Kalshi", fetcher: fetchKalshiMarkets },
];

function marketRank(market: Market) {
  const activity = Math.log10(1 + Math.max(0, market.volume)) * 3;
  const liquidity = Math.log10(1 + Math.max(0, market.liquidity)) * 2;
  const probability = market.prices[0];
  const informative = typeof probability === "number" && probability > 0.01 && probability < 0.99 ? 2 : 0;
  return activity + liquidity + informative;
}

export async function fetchPublicMarketNetwork(limitPerSource = 20) {
  const safeLimit = Math.min(Math.max(Math.floor(limitPerSource), 1), 100);
  const settled = await Promise.allSettled(FETCHERS.map((source) => source.fetcher(safeLimit)));
  const statuses: PublicSourceStatus[] = [];
  const markets: Market[] = [];

  settled.forEach((result, index) => {
    const protocol = FETCHERS[index].protocol;
    if (result.status === "fulfilled") {
      statuses.push({ protocol, status: "LIVE", source: result.value.source, retrievedAt: result.value.retrievedAt, marketCount: result.value.markets.length, error: null });
      markets.push(...result.value.markets);
    } else {
      statuses.push({ protocol, status: "UNAVAILABLE", source: "PUBLIC API", retrievedAt: null, marketCount: 0, error: result.reason instanceof Error ? result.reason.message : "Unknown upstream error" });
    }
  });

  if (!markets.length) throw new Error(`All public market sources are unavailable: ${statuses.map((source) => `${source.protocol}: ${source.error ?? source.status}`).join("; ")}`);

  markets.sort((a, b) => marketRank(b) - marketRank(a));
  return {
    mode: "LIVE_PUBLIC_DATA" as const,
    generatedAt: new Date().toISOString(),
    sources: statuses,
    markets,
  };
}

export async function searchPublicMarkets(query: string, limit = 30) {
  const network = await fetchPublicMarketNetwork(Math.max(20, limit));
  const normalized = query.trim();
  const results = network.markets
    .map((market) => ({ ...market, similarity: canonicalTitleSimilarity(normalized, `${market.title} ${market.description}`) }))
    .filter((market) => market.similarity >= 0.08)
    .sort((a, b) => b.similarity - a.similarity || marketRank(b) - marketRank(a))
    .slice(0, Math.min(Math.max(limit, 1), 100));
  return { ...network, markets: results };
}

export async function findPublicDuplicates(input: { title: string; description?: string }, limit = 10) {
  const network = await fetchPublicMarketNetwork(40);
  const query = `${input.title} ${input.description ?? ""}`.trim();
  const possibleDuplicates = network.markets
    .map((market) => ({
      market,
      similarity: canonicalTitleSimilarity(query, `${market.title} ${market.description}`),
      protocol: market.protocol,
    }))
    .filter((candidate) => candidate.similarity >= 0.25)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.min(Math.max(limit, 1), 50))
    .map((candidate) => ({
      ...candidate,
      explanation: candidate.similarity >= 0.75
        ? "High wording/event similarity to a currently observable public market. Inspect settlement details before listing."
        : "Shares meaningful event wording with a currently observable public market; verify whether the underlying event is actually equivalent.",
    }));
  const top = possibleDuplicates[0]?.similarity ?? 0;
  const duplicateRisk = top >= 0.75 ? "HIGH" : top >= 0.45 ? "MEDIUM" : "LOW";
  return { duplicateRisk, possibleDuplicates, sources: network.sources, generatedAt: network.generatedAt, mode: network.mode };
}

export async function analyzeAgainstPublicMarkets(input: { title: string; description?: string; outcomes?: string[]; resolution?: string; source?: string }) {
  const score = scoreMarket({
    title: input.title,
    description: input.description,
    outcomes: input.outcomes,
    resolutionSource: input.source,
    resolutionTime: input.resolution,
  });
  const duplicates = await findPublicDuplicates(input);
  return {
    score,
    ...duplicates,
    canonicalEvent: null,
    evidenceBoundary: "Duplicate evidence is derived only from live public Polymarket, Manifold, and Kalshi market data available at request time.",
  };
}
