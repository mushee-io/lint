export async function POST() {
  return Response.json({
    error: {
      message: "Synthetic simulation has been retired from the public demo.",
      next: "/explore uses live public prediction-market data. Use /connect to validate a partner payload without persistence."
    }
  }, { status: 410 });
}
