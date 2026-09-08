export async function GET() {
  return Response.json({ status: "ok", service: "market-lint", timestamp: new Date().toISOString() });
}
