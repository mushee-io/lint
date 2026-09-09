import { describe, expect, it } from "vitest";
import { analyzeMarketIntelligence, type IntelligenceContext } from "@/lib/market-intelligence";

const strongContext: IntelligenceContext = {
  marketId: "market-1",
  title: "Will Bitcoin close above $150,000 on December 31, 2026?",
  description: "Resolve YES if the Coinbase BTC-USD spot price is above 150000 USD at the cutoff. Resolve NO otherwise. If Coinbase is unavailable, use its first published price after the cutoff.",
  protocolName: "Polymarket",
  status: "OPEN",
  resolutionSource: "https://www.coinbase.com/price/bitcoin",
  freshness: "FRESH",
  liquidity: 25_000,
  volume: 100_000,
  snapshots: [
    { timestamp: "2026-09-09T05:00:00Z", probability: 0.56, liquidity: 23_000, volume: 90_000 },
    { timestamp: "2026-09-09T05:10:00Z", probability: 0.57, liquidity: 24_000, volume: 94_000 },
    { timestamp: "2026-09-09T05:20:00Z", probability: 0.58, liquidity: 25_000, volume: 100_000 },
    { timestamp: "2026-09-09T05:30:00Z", probability: 0.59, liquidity: 25_000, volume: 100_000 },
  ],
  source: {
    name: "polymarket-gamma",
    freshness: "FRESH",
    consecutiveFailures: 0,
    lastSuccessAt: "2026-09-09T05:30:00Z",
  },
  canonicalEvent: {
    id: "event-1",
    marketCount: 2,
    protocolCount: 2,
    latestConsensus: {
      status: "READY",
      probability: 0.585,
      confidence: "HIGH",
      eventConfidenceScore: 88,
      dispersion: 0.02,
      createdAt: "2026-09-09T05:30:00Z",
    },
  },
  duplicateCandidates: [],
};

describe("market intelligence v1", () => {
  it("rates a well-supported cross-protocol market strongly", () => {
    const result = analyzeMarketIntelligence(strongContext);
    expect(result.status).toBe("STRONG");
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.grade).toMatch(/[AB]/);
    expect(result.resolutionReadiness).toBe("READY");
    expect(result.algorithmVersion).toBe("market-intelligence-v1");
  });

  it("downgrades stale markets with failing upstream data", () => {
    const result = analyzeMarketIntelligence({
      ...strongContext,
      freshness: "STALE",
      source: {
        name: "polymarket-gamma",
        freshness: "STALE",
        consecutiveFailures: 4,
        lastError: "upstream timeout",
      },
    });
    expect(result.status).toBe("WEAK");
    expect(result.dimensions.find((item) => item.code === "DATA_INTEGRITY")?.status).toBe("FAIL");
    expect(result.signals.some((signal) => signal.code === "DATA_INTEGRITY" && signal.severity === "HIGH")).toBe(true);
  });

  it("does not pretend single-source data is consensus", () => {
    const result = analyzeMarketIntelligence({
      ...strongContext,
      canonicalEvent: {
        id: "event-1",
        marketCount: 1,
        protocolCount: 1,
        latestConsensus: {
          status: "INSUFFICIENT_DATA",
          probability: null,
          confidence: "NONE",
          eventConfidenceScore: null,
          dispersion: null,
          createdAt: "2026-09-09T05:30:00Z",
        },
      },
    });
    const consensus = result.dimensions.find((item) => item.code === "CROSS_PROTOCOL_CONSENSUS");
    expect(consensus?.status).toBe("WARN");
    expect(consensus?.summary).toContain("Fewer than two");
  });

  it("surfaces duplicate/event risk as operator evidence", () => {
    const result = analyzeMarketIntelligence({
      ...strongContext,
      duplicateCandidates: [{
        id: "market-2",
        title: "Will BTC close above $150,000 on December 31, 2026?",
        protocol: "Manifold",
        similarity: 0.82,
      }],
    });
    const eventContext = result.dimensions.find((item) => item.code === "EVENT_CONTEXT");
    expect(eventContext?.evidence.topDuplicate).toBeTruthy();
    expect(result.duplicateCandidates[0].similarity).toBe(0.82);
  });
});
