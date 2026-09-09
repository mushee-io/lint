import { describe, expect, it } from "vitest";
import { evaluateGuard } from "@/lib/guard-engine";

const now = new Date("2026-09-09T06:00:00.000Z");

const strongMarket = {
  title: "Will Bitcoin close above $150,000 on December 31, 2026?",
  description: "Resolve YES if the Coinbase BTC-USD spot price is above 150000 USD at the stated cutoff. Resolve NO otherwise, according to the named source. If the source is temporarily unavailable, use its first published price after the cutoff.",
  outcomes: ["YES", "NO"],
  resolutionSource: "https://www.coinbase.com/price/bitcoin",
  closeTime: "2026-12-31T23:59:59Z",
};

describe("Guard v2", () => {
  it("allows a clear, measurable market with complete settlement inputs", () => {
    const result = evaluateGuard(strongMarket, [], now);
    expect(result.decision).toBe("ALLOW");
    expect(result.marketLintScore).toBeGreaterThanOrEqual(82);
    expect(result.evidence.failedChecks).toEqual([]);
    expect(result.risks.resolution).toBe("LOW");
    expect(result.algorithmVersion).toBe("guard-v2");
  });

  it("blocks a market missing multiple mandatory construction fields", () => {
    const result = evaluateGuard({ title: "Will something happen?" }, [], now);
    expect(result.decision).toBe("BLOCK");
    expect(result.evidence.failedChecks).toContain("DEADLINE");
    expect(result.evidence.failedChecks).toContain("RESOLUTION_SOURCE");
    expect(result.evidence.failedChecks).toContain("OUTCOMES");
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it("blocks an already-expired market", () => {
    const result = evaluateGuard({ ...strongMarket, closeTime: "2026-01-01T00:00:00Z" }, [], now);
    expect(result.decision).toBe("BLOCK");
    const deadline = result.checks.find((check) => check.code === "DEADLINE");
    expect(deadline?.status).toBe("FAIL");
    expect(deadline?.score).toBe(0);
  });

  it("routes a high-similarity duplicate to review instead of silently allowing it", () => {
    const result = evaluateGuard(strongMarket, [{
      id: "market_existing",
      title: "Will BTC close above $150,000 on December 31, 2026?",
      protocol: "Polymarket",
      similarity: 0.82,
    }], now);
    expect(result.decision).toBe("REVIEW");
    expect(result.risks.duplicate).toBe("HIGH");
    expect(result.evidence.failedChecks).toContain("DUPLICATE_MARKET");
  });

  it("flags subjective wording and explains how to repair it", () => {
    const result = evaluateGuard({
      ...strongMarket,
      title: "Will Bitcoin have a successful and impressive year by December 31, 2026?",
    }, [], now);
    expect(result.decision).not.toBe("ALLOW");
    expect(result.risks.ambiguity).not.toBe("LOW");
    expect(result.suggestions.some((suggestion) => suggestion.includes("objective"))).toBe(true);
  });
});
