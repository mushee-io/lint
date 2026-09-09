import { AccessError, requireAccess } from "@/lib/auth";
import { getTenantPolicy, setTenantPolicy, type EnterprisePlan, type TenantStatus } from "@/lib/enterprise";
import { configuredSecretMatches } from "@/lib/internal-auth";

const plans = new Set<EnterprisePlan>(["SANDBOX", "PILOT", "PRO", "ENTERPRISE"]);
const statuses = new Set<TenantStatus>(["ACTIVE", "SUSPENDED"]);

export async function GET(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "enterprise:read" });
    return Response.json({ data: await getTenantPolicy(context.organizationId) });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Tenant policy unavailable" } }, { status: 503 });
  }
}

export async function POST(request: Request) {
  if (!configuredSecretMatches(request, "BOOTSTRAP_SECRET", "x-bootstrap-secret")) return Response.json({ error: { message: "Bootstrap authorization required" } }, { status: 401 });
  try {
    const body = await request.json();
    const organizationId = String(body.organizationId ?? "");
    const plan = String(body.plan ?? "") as EnterprisePlan;
    const status = String(body.status ?? "ACTIVE") as TenantStatus;
    if (!organizationId) return Response.json({ error: { message: "organizationId is required" } }, { status: 400 });
    if (!plans.has(plan)) return Response.json({ error: { message: "Invalid plan" } }, { status: 400 });
    if (!statuses.has(status)) return Response.json({ error: { message: "Invalid tenant status" } }, { status: 400 });
    const result = await setTenantPolicy({
      organizationId,
      plan,
      status,
      monthlyRequestLimit: body.monthlyRequestLimit == null ? undefined : Number(body.monthlyRequestLimit),
      perMinuteRequestLimit: body.perMinuteRequestLimit == null ? undefined : Number(body.perMinuteRequestLimit),
      actorId: "bootstrap",
    });
    if (!result) return Response.json({ error: { message: "Organization not found" } }, { status: 404 });
    return Response.json({ data: result });
  } catch (error) {
    return Response.json({ error: { message: "Unable to update tenant policy", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 400 });
  }
}
