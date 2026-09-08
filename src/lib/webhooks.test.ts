import { describe, expect, it } from "vitest";
import { webhookSignature } from "./webhooks";

describe("webhook signatures", () => {
  it("binds the timestamp and body", () => {
    const signature = webhookSignature("secret", "123", "{\"ok\":true}");
    expect(signature).toHaveLength(64);
    expect(signature).not.toBe(webhookSignature("secret", "124", "{\"ok\":true}"));
  });
});
