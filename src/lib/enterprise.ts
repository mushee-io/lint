import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { getOpsStatus } from "@/lib/ops";

const json = (value: unknown) => value as Prisma.InputJsonValue;

export type EnterprisePlan = "SANDBOX" | "PILOT" | "PRO" | "ENTERPRISE";
export type TenantStatus = "ACTIVE" | "SUSPENDED";

export type TenantPolicy = {
  plan: EnterprisePlan;
  status: TenantStatus;
  monthlyRequestLimit: number;
  perMinuteRequestLimit: number;
  updatedAt: string | null;
};

const PLAN_DEFAULTS: Record<EnterprisePlan, Omit<TenantPolicy, "plan" | "status" | "updatedAt">> = {
  SANDBOX: { monthlyRequestLimit: 10_000, perMinuteRequestLimit: 120 },
  PILOT: { monthlyRequestLimit: 100_000, perMinuteRequestLimit: 600 },
  PRO: { monthlyRequestLimit: 1_000_000, perMinuteRequestLimit: 3_000 },
  ENTERPRISE: { monthlyRequestLimit: 10_000_000, perMinuteRequestLimit: 10_000 },
};

function objectValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function planValue(value: unknown): EnterprisePlan {
  return value === "SANDBOX" || value === "PRO" || value === "ENTERPRISE" ? value : "PILOT";
}

function positiveInteger(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function minuteStart(now = new Date()) {
  const value = new Date(now);
  value.setUTCSeconds(0, 0);
  return value;
}

export class EnterpriseAccessError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
  }
}

export async function getTenantPolicy(organizationId: string): Promise<TenantPolicy> {
  const latest = await prisma.auditLog.findFirst({
    where: { organizationId, action: "TENANT_POLICY_SET" },
    orderBy: { createdAt: "desc" },
  });
  const metadata = objectValue(latest?.metadata);
  const plan = planValue(metadata.plan);
  const defaults = PLAN_DEFAULTS[plan];
  return {
    plan,
    status: metadata.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE",
    monthlyRequestLimit: positiveInteger(metadata.monthlyRequestLimit, defaults.monthlyRequestLimit),
    perMinuteRequestLimit: positiveInteger(metadata.perMinuteRequestLimit, defaults.perMinuteRequestLimit),
    updatedAt: latest?.createdAt.toISOString() ?? null,
  };
}

export async function setTenantPolicy(input: {
  organizationId: string;
  plan: EnterprisePlan;
  status?: TenantStatus;
  monthlyRequestLimit?: number;
  perMinuteRequestLimit?: number;
  actorId?: string | null;
}) {
  const organization = await prisma.organization.findUnique({ where: { id: input.organizationId }, select: { id: true, name: true, slug: true } });
  if (!organization) return null;
  const defaults = PLAN_DEFAULTS[input.plan];
  const policy: TenantPolicy = {
    plan: input.plan,
    status: input.status ?? "ACTIVE",
    monthlyRequestLimit: positiveInteger(input.monthlyRequestLimit, defaults.monthlyRequestLimit),
    perMinuteRequestLimit: positiveInteger(input.perMinuteRequestLimit, defaults.perMinuteRequestLimit),
    updatedAt: new Date().toISOString(),
  };
  const record = await prisma.auditLog.create({
    data: {
      organizationId: organization.id,
      actorType: "SYSTEM",
      actorId: input.actorId ?? null,
      action: "TENANT_POLICY_SET",
      resourceType: "Organization",
      resourceId: organization.id,
      metadata: json(policy),
    },
  });
  return { organization, policy: { ...policy, updatedAt: record.createdAt.toISOString() } };
}

export async function consumeApiUsage(input: { organizationId: string; apiKeyId: string; request: Request }) {
  const policy = await getTenantPolicy(input.organizationId);
  if (policy.status !== "ACTIVE") throw new EnterpriseAccessError("Tenant access is suspended", 403, "TENANT_SUSPENDED");

  const now = new Date();
  const month = monthStart(now);
  const minute = minuteStart(now);
  const [monthlyUsed, minuteUsed] = await Promise.all([
    prisma.auditLog.count({ where: { organizationId: input.organizationId, action: "API_REQUEST", createdAt: { gte: month } } }),
    prisma.auditLog.count({ where: { organizationId: input.organizationId, actorId: input.apiKeyId, action: "API_REQUEST", createdAt: { gte: minute } } }),
  ]);

  if (monthlyUsed >= policy.monthlyRequestLimit) throw new EnterpriseAccessError("Monthly API request quota exceeded", 429, "MONTHLY_QUOTA_EXCEEDED");
  if (minuteUsed >= policy.perMinuteRequestLimit) throw new EnterpriseAccessError("API rate limit exceeded", 429, "RATE_LIMIT_EXCEEDED");

  const url = new URL(input.request.url);
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId,
      actorType: "API_KEY",
      actorId: input.apiKeyId,
      action: "API_REQUEST",
      resourceType: "ApiKey",
      resourceId: input.apiKeyId,
      metadata: json({ method: input.request.method, path: url.pathname, plan: policy.plan }),
    },
  });

  return {
    plan: policy.plan,
    monthly: { used: monthlyUsed + 1, limit: policy.monthlyRequestLimit, remaining: Math.max(0, policy.monthlyRequestLimit - monthlyUsed - 1) },
    minute: { used: minuteUsed + 1, limit: policy.perMinuteRequestLimit, remaining: Math.max(0, policy.perMinuteRequestLimit - minuteUsed - 1) },
  };
}

export async function getTenantUsage(organizationId: string) {
  const now = new Date();
  const policy = await getTenantPolicy(organizationId);
  const [monthlyUsed, minuteUsed, activeKeys, liveKeys, activeWebhooks, deliveredWebhooks, deadWebhooks, openIncidents] = await Promise.all([
    prisma.auditLog.count({ where: { organizationId, action: "API_REQUEST", createdAt: { gte: monthStart(now) } } }),
    prisma.auditLog.count({ where: { organizationId, action: "API_REQUEST", createdAt: { gte: minuteStart(now) } } }),
    prisma.apiKey.count({ where: { organizationId, revokedAt: null } }),
    prisma.apiKey.count({ where: { organizationId, revokedAt: null, environment: "live" } }),
    prisma.webhookEndpoint.count({ where: { organizationId, active: true } }),
    prisma.webhookDelivery.count({ where: { endpoint: { organizationId }, status: "DELIVERED", createdAt: { gte: monthStart(now) } } }),
    prisma.webhookDelivery.count({ where: { endpoint: { organizationId }, status: "DEAD_LETTER" } }),
    prisma.riskSignal.count({ where: { organizationId, severity: { in: ["HIGH", "CRITICAL"] }, detectedAt: { gte: new Date(Date.now() - 24 * 60 * 60_000) } } }),
  ]);
  return {
    policy,
    usage: {
      month: { used: monthlyUsed, limit: policy.monthlyRequestLimit, remaining: Math.max(0, policy.monthlyRequestLimit - monthlyUsed), utilization: policy.monthlyRequestLimit ? monthlyUsed / policy.monthlyRequestLimit : 0 },
      minute: { used: minuteUsed, limit: policy.perMinuteRequestLimit, remaining: Math.max(0, policy.perMinuteRequestLimit - minuteUsed), utilization: policy.perMinuteRequestLimit ? minuteUsed / policy.perMinuteRequestLimit : 0 },
    },
    integration: { activeKeys, liveKeys, activeWebhooks, deliveredWebhooksThisMonth: deliveredWebhooks, deadWebhookDeliveries: deadWebhooks, highSeveritySignals24h: openIncidents },
    measuredAt: now.toISOString(),
  };
}

export async function getEnterpriseReadiness(organizationId: string) {
  const [usage, ops, pilot] = await Promise.all([
    getTenantUsage(organizationId),
    getOpsStatus(),
    prisma.pilot.findFirst({ where: { organizationId }, orderBy: { updatedAt: "desc" }, include: { protocol: true } }),
  ]);
  const freshSources = ops.sources.filter((source) => source.freshness === "FRESH").length;
  const checks = [
    { key: "TENANT_ACTIVE", pass: usage.policy.status === "ACTIVE", required: true, detail: usage.policy.status },
    { key: "LIVE_API_KEY", pass: usage.integration.liveKeys > 0, required: true, detail: `${usage.integration.liveKeys} live key(s)` },
    { key: "DATABASE", pass: ops.database.ok, required: true, detail: `${ops.database.latencyMs}ms` },
    { key: "LIVE_SOURCES", pass: freshSources >= 2, required: true, detail: `${freshSources} fresh source(s)` },
    { key: "WORKER_DEAD_LETTERS", pass: ops.workers.deadLetter === 0, required: true, detail: `${ops.workers.deadLetter} dead-letter job(s)` },
    { key: "WEBHOOK_DEAD_LETTERS", pass: usage.integration.deadWebhookDeliveries === 0, required: true, detail: `${usage.integration.deadWebhookDeliveries} dead delivery(s)` },
    { key: "QUOTA_HEADROOM", pass: usage.usage.month.utilization < 0.95, required: true, detail: `${Math.round(usage.usage.month.utilization * 100)}% used` },
    { key: "WEBHOOK_CONFIGURED", pass: usage.integration.activeWebhooks > 0, required: false, detail: `${usage.integration.activeWebhooks} active endpoint(s)` },
  ];
  const blockers = checks.filter((check) => check.required && !check.pass);
  return {
    status: blockers.length ? "NOT_READY" : "READY",
    blockers: blockers.map((check) => check.key),
    checks,
    policy: usage.policy,
    pilot: pilot ? { id: pilot.id, status: pilot.status, protocol: pilot.protocol.name } : null,
    ops,
    measuredAt: new Date().toISOString(),
  };
}

function csvCell(value: unknown) {
  const raw = value == null ? "" : typeof value === "string" ? value : JSON.stringify(value);
  return `"${raw.replaceAll('"', '""')}"`;
}

export async function exportAuditLogs(input: { organizationId: string; from?: Date; to?: Date; limit?: number; includeUsage?: boolean }) {
  const limit = Math.min(Math.max(input.limit ?? 2_000, 1), 5_000);
  const logs = await prisma.auditLog.findMany({
    where: {
      organizationId: input.organizationId,
      ...(input.includeUsage ? {} : { action: { not: "API_REQUEST" } }),
      createdAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  const header = ["id", "createdAt", "actorType", "actorId", "action", "resourceType", "resourceId", "metadata"].join(",");
  const rows = logs.map((log) => [log.id, log.createdAt.toISOString(), log.actorType, log.actorId, log.action, log.resourceType, log.resourceId, log.metadata].map(csvCell).join(","));
  return { logs, csv: [header, ...rows].join("\n") };
}
