import { describe, expect, it } from "vitest";
import { canonicalTitleSimilarity, deterministicCanonicalEventId, normalizeCanonicalTitle } from "@/lib/canonical";

describe("canonical title matching", () => {
  it("normalizes punctuation and casing deterministically", () => {
    expect(normalizeCanonicalTitle("Will BTC win?  ")).toBe("will btc win");
    expect(deterministicCanonicalEventId("Will BTC win?")).toBe(deterministicCanonicalEventId("will-btc-win"));
  });

  it("links semantically equivalent wording conservatively", () => {
    const score = canonicalTitleSimilarity(
      "Will Donald Trump win the 2028 US presidential election?",
      "Donald Trump to win US presidential election in 2028",
    );
    expect(score).toBeGreaterThanOrEqual(0.86);
  });

  it("refuses to link markets with different numeric conditions", () => {
    expect(canonicalTitleSimilarity("Will BTC exceed 100000 in 2026?", "Will BTC exceed 150000 in 2026?")).toBe(0);
  });

  it("refuses to link opposite-negation wording", () => {
    expect(canonicalTitleSimilarity("Will Team A win?", "Will Team A not win?")).toBe(0);
  });
});
