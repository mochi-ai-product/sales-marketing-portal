# Sales & Marketing Portal — Architecture Notes

Status: base scaffold. This documents what's decided vs. what's still open, so
other technical engineers, the AI Enablement Lead, and future contributors
know what's load-bearing and what's a placeholder.

## Stack (decided for this portal)

- Next.js (App Router) + TypeScript — single deployable for UI + API routes.
- Prisma + PostgreSQL — schema-first data model, easy for other services to
  read/document.
- Vitest for tests, ESLint for lint, GitHub Actions for CI.
- Docker (multi-stage, `output: standalone`) for containerized deploys.

Rationale: one deployable, typed end-to-end, minimal moving parts — fastest
path to a working core workflow (priority #1 in the role spec), without
foreclosing a later split into separate API/frontend services if this portal's
scale demands it.

## Data model (placeholder)

`prisma/schema.prisma` has one model (`Lead`) purely to prove the DB → API →
UI path end to end. **This is not the real domain model.** The actual model
(campaigns, funnel/pipeline stages, per-vertical fields for automotive/
beauty/retail/F&B/manufacturing) is the Sales & Marketing Product Manager's
call, driven by the product brief (see MOCAAAAAAAA-4). Conventions to keep
once the real model lands, so this stays easy for other portals/AI tooling to
integrate with:

- `cuid()` primary keys, camelCase fields.
- Explicit `createdAt` / `updatedAt` on every model.
- No soft-delete flags unless a real requirement needs them — keep it simple
  until proven otherwise.

## Open cross-portal questions (not decided unilaterally here)

These affect all four portals and shouldn't be settled by one technical
engineer alone — raising with the other three technical engineers and the
Project Manager (per role boundaries):

1. **Shared auth** — no auth is implemented yet. If customers are expected to
   use one login across portals, auth (provider, session strategy, tenant
   model) needs to be a cross-portal decision, not reinvented four times.
2. **Hosting/deploy target** — this repo is container-ready (Dockerfile +
   compose) but no target platform (e.g. shared cloud account, orchestrator)
   is chosen. Company-wide infra/vendor choice is out of scope for one
   engineer to decide alone.
3. **Multi-tenancy convention** — if one A&D deployment serves many SME
   customers, tenant isolation needs to be a shared convention across portals
   before real data starts flowing.

Until those are resolved, this portal runs as a standalone service with a
local Postgres, which is enough to build and demo the core workflow.

## Running locally

```
cp .env.example .env
npm install
npx prisma generate
npm run dev
```

Or via Docker: `docker compose up --build`.
