import { describe, expect, it } from "vitest";
import { canonicalTitleSimilarity, classifyCanonicalRelationship, deterministicCanonicalEventId, normalizeCanonicalTitle } from "@/lib/canonical";

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

  it("normalizes common protocol-market aliases", () => {
    const assessment = classifyCanonicalRelationship(
      "Will BTC exceed 100k in 2026?",
      "Will Bitcoin exceed 100000 in 2026?",
    );
    expect(assessment.relationshipType).toBe("SAME_EVENT");
    expect(assessment.compatibleNumbers).toBe(true);
  });

  it("refuses to link markets with different numeric conditions", () => {
    expect(canonicalTitleSimilarity("Will BTC exceed 100000 in 2026?", "Will BTC exceed 150000 in 2026?")).toBe(0);
    expect(classifyCanonicalRelationship("Will BTC exceed 100000 in 2026?", "Will BTC exceed 150000 in 2026?").relationshipType).toBe("RELATED_EVENT");
  });

  it("refuses to group opposing threshold directions", () => {
    const assessment = classifyCanonicalRelationship("Will BTC be above 100000 in 2026?", "Will BTC be below 100000 in 2026?");
    expect(assessment.relationshipType).toBe("RELATED_EVENT");
    expect(assessment.compatibleDirection).toBe(false);
  });

  it("refuses to link opposite-negation wording", () => {
    expect(canonicalTitleSimilarity("Will Team A win?", "Will Team A not win?")).toBe(0);
    expect(classifyCanonicalRelationship("Will Team A win?", "Will Team A not win?").relationshipType).toBe("RELATED_EVENT");
  });
});
