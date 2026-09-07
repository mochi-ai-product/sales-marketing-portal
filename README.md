# Sales & Marketing Portal

A&D Technologies Sdn Bhd — the Sales & Marketing module of the multi-portal
SME SaaS platform. Owned end-to-end (build + deploy) by the Technical
Engineer paired with the Sales & Marketing Product Manager (MOCAAAAAAAA-4).

## Status

Base scaffold only. No product features yet — waiting on the product brief
to define the core workflow and target vertical. Cross-portal infra
(hosting, multi-tenancy convention) is decided — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for what's decided vs. open.

## Stack

Next.js (App Router) + TypeScript, Prisma + PostgreSQL, Vitest, ESLint,
GitHub Actions CI, Docker.

## Getting started

```
cp .env.example .env
npm install
npx prisma generate
npm run dev
```

Health check: `GET /api/health`.

## Scripts

- `npm run dev` — local dev server
- `npm run build` / `npm run start` — production build/run
- `npm run lint` / `npm run typecheck` / `npm run test` — CI checks
- `npm run prisma:generate` — regenerate Prisma client after schema changes

## Deployment

Deploys to [Render](https://render.com) via the checked-in `render.yaml`
Blueprint (Dockerfile-based, free tier for now — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#hosting-decided--mocaaaaaaaa-2526)).

## Multi-tenancy

Single-DB, `organizationId`-scoped rows. See `src/lib/tenant.ts` and
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#multi-tenancy-decided--mocaaaaaaaa-2526).

## Auth

Shared JWT verification package (`@ad-tech/auth-verify` v0.1.0, WorkOS-backed)
is vendored at `libs/auth-verify/` and wrapped for this portal's Next.js App
Router in `src/lib/auth.ts` — see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#authsso-package-integrated--mocaaaaaaaa-33-no-live-login-yet).
No customer-facing route uses it yet; wire it in once the product brief
defines a login-gated surface.
