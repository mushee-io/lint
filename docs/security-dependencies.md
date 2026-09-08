# Dependency security policy

CI runs two dependency checks:

1. `npm run security:audit` is the blocking production gate. Any unapproved high or critical advisory fails the build.
2. A full `npm audit` runs as a non-blocking report so development-tool advisories remain visible.

## Temporary Prisma CLI exception

The current stable Prisma 7.10 toolchain pulls `@prisma/config`, `deepmerge-ts`, and `mysql2` through the Prisma CLI/optional peer path. The current npm advisory remediation recommends a breaking downgrade of Prisma rather than a patched stable 7.x release. Market Lint therefore carries a narrow high-severity exception for exactly `prisma`, `@prisma/config`, `deepmerge-ts`, and `mysql2` in `scripts/security-audit.mjs`.

This exception does not permit critical advisories and does not permit unrelated high advisories. It must be removed as soon as a patched stable Prisma release compatible with the application is available. `shadcn` is classified as development-only tooling so its CLI/MCP dependencies are excluded from the runtime dependency surface.

Do not use `npm audit fix --force` without reviewing the dependency and migration impact.
