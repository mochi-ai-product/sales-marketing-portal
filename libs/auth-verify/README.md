# @ad-tech/auth-verify

Shared JWT verification middleware for A&D Technologies' four portals
(Sales & Marketing, Talent Management, Hiring, KPI & Performance). Built
per the Technical Director's cross-portal infra decision
([MOCAAAAAAAA-25](/MOCAAAAAAAA/issues/MOCAAAAAAAA-25), `infra-decision`
doc, §3) and piloted on
[MOCAAAAAAAA-27](/MOCAAAAAAAA/issues/MOCAAAAAAAA-27).

Each portal keeps validating its own logged-in requests locally with this
package — there's no runtime call to a central auth server on every
request, only periodic JWKS fetches (cached) from the identity provider.

See `CONTRACT.md` for the full JWT claims contract and the
header-vs-JWT multi-tenancy rule. This file covers vendor choice and
integration.

> **Vendored copy, Sales & Marketing portal.** This directory is a vendored
> copy of the v0.1.0 package published on MOCAAAAAAAA-27/33, unmodified
> from the source document except for this note. This portal is Next.js
> (App Router), not Express — the `requireAuth`/`requireRole` Express
> middleware below is not used directly here; see `src/lib/auth.ts` at the
> repo root for the Next.js Route Handler adapter built on top of
> `createVerifier`/`verify()`.

## Vendor decision — WorkOS

Evaluated Clerk, WorkOS, and Auth0 per the infra decision's recommendation
to use a managed identity provider instead of hand-rolled password/session
storage (no dedicated security engineer on the team; this is high-risk,
low-differentiation work to build in-house).

**Picked WorkOS** (User Management + AuthKit):

- **Built for B2B multi-tenant SaaS specifically** — WorkOS's
  `Organization` and `OrganizationMembership` (with role) objects map
  directly onto the `organizationId` + role shape this contract needs,
  with no bespoke data modeling on our side.
- **Room to grow into enterprise SSO without a rewrite.** Target
  industries include automotive and manufacturing SMEs who may eventually
  demand SAML/OIDC SSO from their own IdP. WorkOS's SSO product plugs into
  the same `Organization` model AuthKit already uses — Clerk and Auth0
  both support this too, but WorkOS treats it as the default B2B path
  rather than an enterprise upsell bolted onto a consumer-auth product.
- **Standards-based verification.** AuthKit issues JWTs verifiable via a
  standard JWKS endpoint (RS256) — no proprietary SDK required on the
  verifying side, which is what let this package be provider-agnostic
  (see `CONTRACT.md` §1). If this vendor choice is ever revisited, the
  verifier keeps working against any OIDC-compliant issuer.
- **AuthKit's free tier covers our stage** (unlimited monthly active
  users under WorkOS's standard AuthKit plan as of this evaluation) —
  material for an SME-focused product where per-MAU auth pricing would
  compound against thin margins.

Clerk was the closest runner-up (excellent DX, free-tier Organizations),
but is consumer/B2C-first in its design center; Auth0 is powerful but
carries more configuration surface and cost than a team without a
dedicated IAM engineer needs at this stage.

**Not done in this pilot (needs a human with account/billing
authority):** actually creating the WorkOS account, configuring the
AuthKit application, and issuing the production JWKS URL. Nothing in this
package requires that to exist yet — the dev/CI path (below) works
standalone. Tracked as a follow-up; flagged in the MOCAAAAAAAA-27 report.

## Install

Not yet published to a package registry (no company npm/GitHub org exists
yet — flagged as a follow-up on MOCAAAAAAAA-27). Until then, vendor this
package directly:

1. Copy this directory into your portal's repo (e.g. `libs/auth-verify/`).
2. `npm install` inside it, then `npm run build`.
3. Add it as a local `file:` dependency in your portal's `package.json`:
   ```json
   "@ad-tech/auth-verify": "file:./libs/auth-verify"
   ```
4. Once a shared registry exists, swap the `file:` dependency for a real
   version pin — no code changes needed on your side.

## Usage

```ts
import express from 'express';
import { createVerifier, requireAuth, requireRole, verifierConfigFromEnv } from '@ad-tech/auth-verify';

const verifier = createVerifier(verifierConfigFromEnv());
// or explicitly:
// const verifier = createVerifier({
//   issuer: 'https://your-workos-authkit-domain/',
//   audience: 'ad-tech-portals',
//   jwksUrl: 'https://your-workos-authkit-domain/.well-known/jwks.json',
// });

const app = express();

// Customer-facing route: organizationId comes ONLY from the verified JWT.
app.get('/v1/me/staff-profile', requireAuth(verifier), (req, res) => {
  const { sub, organizationId, role } = req.auth!;
  res.json({ sub, organizationId, role });
});

// Restrict to specific roles within the caller's org.
app.post(
  '/v1/org-units',
  requireAuth(verifier),
  requireRole('admin', 'owner'),
  (req, res) => {
    /* ... */
  },
);
```

### Environment variables (`verifierConfigFromEnv()`)

| Var | Required | Purpose |
|---|---|---|
| `AUTH_ISSUER` | yes | Expected `iss` claim. |
| `AUTH_AUDIENCE` | yes | Expected `aud` claim. |
| `AUTH_JWKS_URL` | prod | Identity provider's JWKS endpoint (RS256). |
| `AUTH_DEV_SHARED_SECRET` | dev/CI only | HS256 shared secret. **Refuses to construct if set while `NODE_ENV=production`.** Use this before your portal has a real WorkOS AuthKit app configured. |

### Error responses

`requireAuth` responds `401 {"error":"unauthorized","reason":...}` for
`missing_token` / `malformed_token` / `invalid_signature` /
`expired_token` / `invalid_claims`. `requireRole` responds
`403 {"error":"forbidden","reason":"insufficient_role","allowedRoles":[...]}`.

## Local development / test

```bash
NODE_ENV=development npm install
NODE_ENV=development npm run build
NODE_ENV=development npm test
```

(This sandbox's shell defaults `NODE_ENV=production`, which makes `npm
install` skip devDependencies — override it as above if you hit that.)

## Changing the contract

See `CONTRACT.md` §5 — any change to the claim shape or the exported
function signatures needs sign-off from all four portal TEs.
