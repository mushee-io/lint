import { authorizeSchedulerRequest } from "@/lib/scheduler-auth";
import { buildValidationReport } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authorizeSchedulerRequest(request);
  if (!auth.ok) return Response.json({ error: { message: "Validation authorization required" } }, { status: 401 });

  try {
    return Response.json({ data: await buildValidationReport() });
  } catch (error) {
    return Response.json({
      error: {
        message: "Validation report unavailable",
        detail: error instanceof Error ? error.message : "Unknown validation failure",
      },
    }, { status: 503 });
  }
}
