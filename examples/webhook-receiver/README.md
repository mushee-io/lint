# Local webhook receiver

Run `node server.mjs` with `MARKET_LINT_WEBHOOK_SECRET` set to the configured development secret. It verifies an HMAC SHA-256 signature, a five-minute timestamp window, and idempotency keys. It prints only an event ID.
