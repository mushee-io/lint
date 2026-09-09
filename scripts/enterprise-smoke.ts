import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createApiKey } from "../src/lib/auth";
import { prisma } from "../src/lib/db";
import { getTenantPolicy, setTenantPolicy } from "../src/lib/enterprise";
import { GET as getUsage } from "../src/app/api/v1/enterprise/usage/route";
import { GET as getReadiness } from "../src/app/api/v1/enterprise/readiness/route";
import { GET as exportAudit } from "../src/app/api/v1/enterprise/audit-export/route";
import { GET as getWebhookStats } from "../src/app/api/v1/webhooks/stats/route";
import { POST as rotateKey } from "../src/app/api/v1/api-keys/rotate/route";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Enterprise smoke must not run against production");
  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`;
  const organization = await prisma.organization.create({ data: { name: `Enterprise ${suffix}`, slug: `enterprise-${suffix}` } });
  const protocol = await prisma.protocol.create({ data: { organizationId: organization.id, name: `EnterpriseProtocol-${suffix}`, sourceName: `enterprise-source-${suffix}`, status: "LIVE_TEST" } });
  const key = await createApiKey({
    organizationId: organization.id,
    protocolId: protocol.id,
    environment: "live",
    permissions: ["enterprise:read", "audit:export", "webhooks:read", "api_keys:write"],
    label: "enterprise-smoke",
  });

  const sourceA = `enterprise-source-a-${suffix}`;
  const sourceB = `enterprise-source-b-${suffix}`;
  await prisma.dataSourceState.createMany({ data: [
    { source: sourceA, freshness: "FRESH", lastAttemptAt: new Date(), lastSuccessAt: new Date(), consecutiveFailures: 0 },
    { source: sourceB, freshness: "FRESH", lastAttemptAt: new Date(), lastSuccessAt: new Date(), consecutiveFailures: 0 },
  ] });

  try {
    const policySet = await setTenantPolicy({ organizationId: organization.id, plan: "ENTERPRISE", monthlyRequestLimit: 1_000, perMinuteRequestLimit: 50, actorId: "enterprise-smoke" });
    assert(policySet);
    const policy = await getTenantPolicy(organization.id);
    assert.equal(policy.plan, "ENTERPRISE");
    assert.equal(policy.monthlyRequestLimit, 1_000);

    const headers = { authorization: `Bearer ${key.secret}` };
    const usageResponse = await getUsage(new Request("http://localhost/api/v1/enterprise/usage", { headers }));
    assert.equal(usageResponse.status, 200);
    const usage = await usageResponse.json() as { data: { policy: { plan: string }; integration: { liveKeys: number }; usage: { month: { used: number } } } };
    assert.equal(usage.data.policy.plan, "ENTERPRISE");
    assert.equal(usage.data.integration.liveKeys, 1);
    assert(usage.data.usage.month.used >= 1);

    const readinessResponse = await getReadiness(new Request("http://localhost/api/v1/enterprise/readiness", { headers }));
    assert.equal(readinessResponse.status, 200);
    const readiness = await readinessResponse.json() as { data: { status: string; checks: Array<{ key: string; pass: boolean }> } };
    assert(readiness.data.checks.some((check) => check.key === "LIVE_API_KEY" && check.pass));

    const auditResponse = await exportAudit(new Request("http://localhost/api/v1/enterprise/audit-export?format=csv", { headers }));
    assert.equal(auditResponse.status, 200);
    assert((auditResponse.headers.get("content-type") ?? "").includes("text/csv"));
    assert((await auditResponse.text()).includes("TENANT_POLICY_SET"));

    const webhookStatsResponse = await getWebhookStats(new Request("http://localhost/api/v1/webhooks/stats", { headers }));
    assert.equal(webhookStatsResponse.status, 200);

    const rotateResponse = await rotateKey(new Request("http://localhost/api/v1/api-keys/rotate", {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ id: key.key.id }),
    }));
    assert.equal(rotateResponse.status, 201);
    const rotated = await rotateResponse.json() as { data: { id: string; secret: string; revokedKeyId: string } };
    assert.equal(rotated.data.revokedKeyId, key.key.id);
    const revoked = await prisma.apiKey.findUnique({ where: { id: key.key.id } });
    assert(revoked?.revokedAt);

    const oldKeyResponse = await getUsage(new Request("http://localhost/api/v1/enterprise/usage", { headers }));
    assert.equal(oldKeyResponse.status, 401);
    const newKeyResponse = await getUsage(new Request("http://localhost/api/v1/enterprise/usage", { headers: { authorization: `Bearer ${rotated.data.secret}` } }));
    assert.equal(newKeyResponse.status, 200);

    const quotaOrg = await prisma.organization.create({ data: { name: `Quota ${suffix}`, slug: `quota-${suffix}` } });
    const quotaKey = await createApiKey({ organizationId: quotaOrg.id, environment: "live", permissions: ["enterprise:read"], label: "quota-smoke" });
    await setTenantPolicy({ organizationId: quotaOrg.id, plan: "SANDBOX", monthlyRequestLimit: 100, perMinuteRequestLimit: 2, actorId: "enterprise-smoke" });
    const quotaHeaders = { authorization: `Bearer ${quotaKey.secret}` };
    assert.equal((await getUsage(new Request("http://localhost/api/v1/enterprise/usage", { headers: quotaHeaders }))).status, 200);
    assert.equal((await getUsage(new Request("http://localhost/api/v1/enterprise/usage", { headers: quotaHeaders }))).status, 200);
    assert.equal((await getUsage(new Request("http://localhost/api/v1/enterprise/usage", { headers: quotaHeaders }))).status, 429);

    console.log(JSON.stringify({
      status: "PASS",
      tenantPolicy: "PASS",
      durableUsageMetering: "PASS",
      rateLimit: "PASS",
      readiness: readiness.data.status,
      auditExport: "PASS",
      webhookObservability: "PASS",
      keyRotation: "PASS",
      revokedKeyBoundary: "PASS",
    }, null, 2));

    await prisma.auditLog.deleteMany({ where: { organizationId: quotaOrg.id } });
    await prisma.apiKey.deleteMany({ where: { organizationId: quotaOrg.id } });
    await prisma.organization.delete({ where: { id: quotaOrg.id } });
  } finally {
    await prisma.auditLog.deleteMany({ where: { organizationId: organization.id } }).catch(() => undefined);
    await prisma.apiKey.deleteMany({ where: { organizationId: organization.id } }).catch(() => undefined);
    await prisma.protocol.deleteMany({ where: { organizationId: organization.id } }).catch(() => undefined);
    await prisma.organization.delete({ where: { id: organization.id } }).catch(() => undefined);
    await prisma.dataSourceState.deleteMany({ where: { source: { in: [sourceA, sourceB] } } }).catch(() => undefined);
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
