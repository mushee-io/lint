# Deployment assumptions

Run the API, worker, PostgreSQL, and Redis-compatible queue/cache as separate services. Terminate TLS before the API, store secrets in a managed secret provider, run Prisma migrations as a controlled release step, and use `/health` and `/ready` for orchestration checks. Back up PostgreSQL regularly and validate restores against an isolated environment. The current repository provides local Docker infrastructure; durable queue, cache, and worker adapters remain an activation step before production deployment.
