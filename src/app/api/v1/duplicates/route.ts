import { bad, ok } from "@/lib/api";
import { findPublicDuplicates } from "@/lib/public-markets";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body?.title) return bad("title is required");
    return ok(await findPublicDuplicates({ title: String(body.title), description: typeof body.description === "string" ? body.description : undefined }));
  } catch (error) {
    return Response.json({ error: { message: "Live duplicate analysis unavailable", detail: error instanceof Error ? error.message : "Invalid JSON" } }, { status: 503 });
  }
}
