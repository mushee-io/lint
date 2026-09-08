import { describe, expect, it } from "vitest";
import { classifyFreshness } from "./freshness";

describe("classifyFreshness", () => {
  const now = new Date("2026-09-08T17:00:00.000Z");
  it("classifies persisted retrieval age without inventing freshness", () => {
    expect(classifyFreshness("2026-09-08T16:59:00.000Z", now)).toBe("FRESH");
    expect(classifyFreshness("2026-09-08T16:55:00.000Z", now)).toBe("AGING");
    expect(classifyFreshness("2026-09-08T16:40:00.000Z", now)).toBe("STALE");
    expect(classifyFreshness(null, now)).toBe("UNKNOWN");
  });
});
