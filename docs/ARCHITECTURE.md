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

## Data model

`Lead` is still a placeholder — proves the DB → API → UI path end to end,
not the real lead/funnel model (that's still the Product Manager's call per
the brief, MOCAAAAAAAA-4).

`Product` (MOCAAAAAAAA-64) is the first real domain model: owner/staff define
priced treatments/packages, scoped by `organizationId`, so sales (Epic 3
extension, MOCAAAAAAAA-66) log real line items instead of a free-text amount.
CRUD lives at `src/app/api/products/` — first customer-facing routes to
actually call `requireAuth()`/`requireRole()` (see Auth/SSO below).
`Product.active` is an intentional exception to the "no soft-delete" rule
below: deactivating must never delete the row or rewrite historical sales,
since line items are expected to snapshot `name`/`priceCents` at sale time
rather than live-reference this table (see the model's schema comment).

`prisma/migrations/` now exists (`20260907074205_init_lead_and_product` —
first real migration, covering both `Lead` and `Product` since neither had
been migrated before this).

Conventions to keep as the real model lands, so this stays easy for other
portals/AI tooling to integrate with:

- `cuid()` primary keys, camelCase fields.
- Explicit `createdAt` / `updatedAt` on every model.
- `organizationId` + `@@index([organizationId])` on every model (see
  Multi-tenancy below) — non-negotiable from here on, not just for `Lead`.
- No soft-delete flags unless a real requirement needs them (`Product.active`
  is the first such requirement — protecting historical revenue data from
  retroactive drift) — keep it simple until proven otherwise.
- Money is integer cents (e.g. `priceCents`), never float/Decimal, to avoid
  rounding drift.

## Multi-tenancy (decided — MOCAAAAAAAA-25/26)

Company-wide standard: **single-DB, `organizationId`-scoped rows**, same
pattern as Talent Management's `CONTRACT.md` (MOCAAAAAAAA-7) and KPI. No
schema-per-tenant, no per-tenant database.

- `organizationId` is a plain scoped column on every row, not a cross-service
  foreign key — Talent Management owns `Organization` as the source of truth.
- **Service-to-service calls** (other portals calling this one, or this
  portal calling others): `x-organization-id` header + a scoped `x-api-key`.
  See `src/lib/tenant.ts` for the resolver. No cross-portal integration has
  shipped yet, so scoped-key validation against a real key store is stubbed
  in — wire it up when the first consumer lands.
- **Customer-facing routes** (once auth ships, see below): `organizationId`
  MUST be derived from the verified JWT claim, never from a client-supplied
  header. A client-supplied org header on a customer-facing route is a
  tenant-isolation bypass.

## Hosting (decided — MOCAAAAAAAA-25/26)

**Render**, one shared A&D Technologies team account, one Web Service + one
managed Postgres per portal. `render.yaml` in this repo is the Blueprint —
Render builds `Dockerfile` directly.

- Started on Render's **free** plan per MOCAAAAAAAA-26, ahead of the board
  hosting-spend approval (still pending, tracked on MOCAAAAAAAA-25). Bump the
  web service and Postgres to the `starter` plan once that approval lands.
- Rationale, trade-offs, and the revisit trigger are recorded in full on the
  `infra-decision` document on MOCAAAAAAAA-25 — this section is the summary,
  that document is the source of truth.

## Auth/SSO (package integrated — MOCAAAAAAAA-33; no live login yet)

Decision: one shared identity layer for all four portals, not four
independent logins. Talent Management TE piloted a shared auth/JWT
verification package (`@ad-tech/auth-verify` v0.1.0, WorkOS/AuthKit-backed,
published on MOCAAAAAAAA-27) that this portal does not roll its own
alternative to.

- **Vendored** at `libs/auth-verify/` (no shared package registry exists
  yet — see the package's own README "Install" section). Referenced from
  this repo's `package.json` as `"@ad-tech/auth-verify": "file:./libs/auth-verify"`;
  a root `postinstall` script builds it automatically on `npm install`.
- The upstream package ships **Express** middleware
  (`requireAuth`/`requireRole`); this portal is Next.js App Router with no
  Express layer, so `src/lib/auth.ts` re-implements the same behavior as a
  plain async helper for Route Handlers, built on the package's
  framework-agnostic `createVerifier()`/`verify()`. See its tests
  (`src/lib/auth.test.ts`) for usage against the HS256 dev-shared-secret
  path.
- Env vars: `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URL` (prod),
  `AUTH_DEV_SHARED_SECRET` (dev/CI only) — see `.env.example`.
- **First customer-facing routes now live:** `src/app/api/products/` (Product
  catalog, MOCAAAAAAAA-64) calls `requireAuth()` and derives
  `organizationId` from its result, never from `x-organization-id` — see
  `src/lib/tenant.ts`. Role check uses `requireRole(auth, 'owner', 'staff')`;
  per CONTRACT.md §2 there's still no cross-portal role taxonomy, so
  `owner`/`staff` are this portal's own role strings, not a shared standard.
  No production WorkOS account exists yet either (tracked on
  MOCAAAAAAAA-27, needs account/billing authority), so this only works
  against the HS256 dev-shared-secret path until that lands.

## Running locally

```
cp .env.example .env
npm install
npx prisma generate
npm run dev
```

Or via Docker: `docker compose up --build`.

## Deploying

Render Blueprint (`render.yaml`) is checked in. To deploy: connect this repo
to the shared A&D Technologies Render team account (dashboard → New →
Blueprint, or `render blueprint launch` via the Render CLI once logged in).
Render builds `Dockerfile` and provisions the free-tier Postgres instance
declared in the blueprint; no manual env var setup needed beyond what's in
`render.yaml`.
