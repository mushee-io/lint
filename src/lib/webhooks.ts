import crypto from "node:crypto";
import { lookup } from "node:dns/promises";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";

const json = (value: unknown) => value as Prisma.InputJsonValue;

function encryptionKey() {
  const secret = process.env.WEBHOOK_ENCRYPTION_KEY;
  if (!secret) throw new Error("WEBHOOK_ENCRYPTION_KEY is required to store webhook secrets");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptWebhookSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((value) => value.toString("base64url")).join(".");
}

export function decryptWebhookSecret(ciphertext: string) {
  const [ivRaw, tagRaw, bodyRaw] = ciphertext.split(".");
  if (!ivRaw || !tagRaw || !bodyRaw) throw new Error("Invalid encrypted webhook secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivRaw, "base64url"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(bodyRaw, "base64url")), decipher.final()]).toString("utf8");
}

function privateIpv4(value: string) {
  const parts = value.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function privateAddress(value: string) {
  const address = value.toLowerCase();
  return privateIpv4(address) || address === "::1" || address.startsWith("fe80:") || address.startsWith("fc") || address.startsWith("fd");
}

export async function validateWebhookUrl(raw: string, allowPrivate = process.env.NODE_ENV !== "production") {
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Webhook URL must use HTTP or HTTPS");
  if (url.username || url.password) throw new Error("Webhook URLs may not contain credentials");
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") throw new Error("Production webhooks require HTTPS");
  if (!allowPrivate) {
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost") || privateAddress(hostname)) throw new Error("Private webhook destinations are blocked");
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => privateAddress(entry.address))) throw new Error("Webhook destination resolves to a private address");
  }
  return url;
}

export function webhookSignature(secret: string, timestamp: string, body: string) {
  return crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export async function createWebhookEndpoint(input: { organizationId: string; url: string; description?: string; secret?: string }) {
  await validateWebhookUrl(input.url);
  const secret = input.secret ?? crypto.randomBytes(32).toString("base64url");
  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      organizationId: input.organizationId,
      url: input.url,
      description: input.description,
      secretCiphertext: encryptWebhookSecret(secret),
    },
    select: { id: true, organizationId: true, url: true, description: true, active: true, createdAt: true },
  });
  return { endpoint, secret };
}

export async function enqueueSignalDeliveries(signal: { id: string; organizationId: string | null; type: string; severity: string; confidence: number; marketId: string | null; eventId: string | null; detectedAt: Date; evidence: unknown; recommendedAction: string }) {
  if (!signal.organizationId) return { queued: 0 };
  const endpoints = await prisma.webhookEndpoint.findMany({ where: { organizationId: signal.organizationId, active: true } });
  let queued = 0;
  for (const endpoint of endpoints) {
    const idempotencyKey = `signal:${signal.id}:endpoint:${endpoint.id}`;
    await prisma.webhookDelivery.upsert({
      where: { idempotencyKey },
      update: {},
      create: {
        endpointId: endpoint.id,
        signalId: signal.id,
        eventType: "risk.signal.created",
        idempotencyKey,
        payload: json({
          id: signal.id,
          type: signal.type,
          severity: signal.severity,
          confidence: signal.confidence,
          marketId: signal.marketId,
          eventId: signal.eventId,
          detectedAt: signal.detectedAt.toISOString(),
          evidence: signal.evidence,
          recommendedAction: signal.recommendedAction,
        }),
      },
    });
    queued += 1;
  }
  return { queued };
}

export async function replayWebhookDelivery(deliveryId: string, organizationId: string) {
  const delivery = await prisma.webhookDelivery.findFirst({ where: { id: deliveryId, endpoint: { organizationId } } });
  if (!delivery) return null;
  return prisma.webhookDelivery.update({
    where: { id: delivery.id },
    data: { status: "RETRYING", nextAttemptAt: new Date(), lastError: null },
  });
}

export async function deliverPendingWebhooks(limit = 25, fetchImpl: typeof fetch = fetch) {
  const now = new Date();
  const deliveries = await prisma.webhookDelivery.findMany({
    where: { status: { in: ["PENDING", "RETRYING"] }, nextAttemptAt: { lte: now } },
    include: { endpoint: true },
    orderBy: { nextAttemptAt: "asc" },
    take: limit,
  });

  let delivered = 0;
  let retried = 0;
  let deadLettered = 0;

  for (const delivery of deliveries) {
    const attemptedAt = new Date();
    try {
      const target = await validateWebhookUrl(delivery.endpoint.url);
      const body = JSON.stringify(delivery.payload);
      const timestamp = String(Date.now());
      const secret = decryptWebhookSecret(delivery.endpoint.secretCiphertext);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7_000);
      let response: Response;
      try {
        response = await fetchImpl(target, {
          method: "POST",
          redirect: "manual",
          signal: controller.signal,
          headers: {
            "content-type": "application/json",
            "user-agent": "MarketLint-Webhook/1.0",
            "x-marketlint-event": delivery.eventType,
            "x-marketlint-timestamp": timestamp,
            "x-marketlint-signature": webhookSignature(secret, timestamp, body),
            "idempotency-key": delivery.idempotencyKey,
          },
          body,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: { status: "DELIVERED", attemptCount: { increment: 1 }, lastAttemptAt: attemptedAt, responseStatus: response.status, deliveredAt: new Date(), lastError: null },
      });
      delivered += 1;
    } catch (error) {
      const attempts = delivery.attemptCount + 1;
      const dead = attempts >= delivery.maxAttempts;
      const backoffMs = Math.min(60 * 60_000, 2 ** Math.min(attempts, 10) * 5_000);
      await prisma.webhookDelivery.update({
        where: { id: delivery.id },
        data: {
          status: dead ? "DEAD_LETTER" : "RETRYING",
          attemptCount: attempts,
          lastAttemptAt: attemptedAt,
          nextAttemptAt: new Date(Date.now() + backoffMs),
          lastError: (error instanceof Error ? error.message : "Unknown webhook error").slice(0, 1000),
        },
      });
      if (dead) deadLettered += 1;
      else retried += 1;
    }
  }
  return { checked: deliveries.length, delivered, retried, deadLettered };
}
