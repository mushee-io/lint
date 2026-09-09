import { AccessError, requireAccess } from "@/lib/auth";
import { exportAuditLogs } from "@/lib/enterprise";

export const dynamic = "force-dynamic";

function dateParam(value: string | null) {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: Request) {
  try {
    const context = await requireAccess(request, { permission: "audit:export" });
    const url = new URL(request.url);
    const from = dateParam(url.searchParams.get("from"));
    const to = dateParam(url.searchParams.get("to"));
    if (from === null || to === null) return Response.json({ error: { message: "from/to must be valid ISO dates" } }, { status: 400 });
    const format = url.searchParams.get("format") === "json" ? "json" : "csv";
    const result = await exportAuditLogs({
      organizationId: context.organizationId,
      from,
      to,
      limit: Number(url.searchParams.get("limit")) || undefined,
      includeUsage: url.searchParams.get("includeUsage") === "true",
    });
    if (format === "json") return Response.json({ data: result.logs });
    return new Response(result.csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="market-lint-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: { message: error.message } }, { status: error.status });
    return Response.json({ error: { message: "Audit export unavailable", detail: error instanceof Error ? error.message : "Unknown error" } }, { status: 503 });
  }
}
