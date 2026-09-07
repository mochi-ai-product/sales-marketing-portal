# Shared Auth/JWT Contract (v0.1, DRAFT)

**Owner:** Technical Engineer — Talent Management Portal, piloting per the
Technical Director's decision on
[MOCAAAAAAAA-25](/MOCAAAAAAAA/issues/MOCAAAAAAAA-25) (`infra-decision`
document) and tracked on
[MOCAAAAAAAA-27](/MOCAAAAAAAA/issues/MOCAAAAAAAA-27).
**Status:** v0.1.0 — first version other portals can integrate against.
The claim shape below is intentionally minimal and stable, but not
guaranteed permanent: any breaking change requires agreement from all four
portal technical engineers (same discipline as the Talent Management
staff-data `CONTRACT.md`), and ships as a new major version.

## 1. Identity provider

**WorkOS** (User Management + AuthKit), chosen over Clerk/Auth0 — see
`README.md` §"Vendor decision" for the full rationale. This contract is
provider-agnostic by design: it only depends on the identity provider
issuing standard OIDC-style JWTs verifiable via JWKS, so the verifier
would keep working if that choice ever changes.

## 2. JWT claims

Every access token issued by the shared identity layer carries:

| Claim | Type | Meaning |
|---|---|---|
| `sub` | string | Identity-provider user id. Stable per human user across all four portals (that's the point of SSO). |
| `organizationId` | string | The tenant the caller is currently acting in. Matches the `Organization.id` convention already used in Talent Management's/KPI's `organizationId`-scoped schemas. |
| `role` | string | Opaque role string, scoped to `organizationId`. **No cross-portal role taxonomy exists yet** — each portal defines and enforces its own permitted role set via `requireRole(...)`. A shared taxonomy (e.g. `owner`/`admin`/`member` common across portals) is flagged as a follow-on decision, not solved by v0.1. |
| `iss` | string | Identity provider issuer URL. Verified by the verifier. |
| `aud` | string | Shared audience identifier for the four portals. Verified by the verifier. |
| `exp` / `iat` | number | Standard expiry/issued-at. Verified by the verifier. |

Signed **RS256** in production, verified against the identity provider's
published JWKS (rotatable without any portal redeploying). A **HS256
shared-secret** mode exists for local dev/CI/staging use only — see
`README.md` — and the verifier refuses to construct with it when
`NODE_ENV=production`.

## 3. Multi-tenancy interaction (the header vs. JWT refinement)

Per the infra decision's multi-tenancy refinement:

- **Customer-facing routes** (anything reached via a logged-in user's
  session) MUST derive `organizationId` from `req.auth.organizationId`
  (the verified JWT claim) — **never** from a client-supplied
  `x-organization-id` header. A header on a customer-facing route is a
  tenant-isolation bypass: any authenticated user could pass another
  org's id.
- **Service-to-service calls** (e.g. Hiring → Talent staff intake, KPI →
  Talent staff/org reads) keep the existing `x-organization-id` header +
  scoped API key pattern unchanged — those are not customer sessions and
  this package does not apply to them.
- This package's `requireAuth` middleware deliberately never reads
  `x-organization-id` — it only trusts the verified token. See
  `middleware.test.ts` for a regression test asserting this.

## 4. What this package does NOT do (v0.1 scope)

- Does not issue tokens, handle login/signup UI, or manage sessions —
  that's the identity provider's job (WorkOS AuthKit hosted UI).
- Does not define a cross-portal role taxonomy (§2).
- Does not handle refresh-token rotation or logout propagation across
  portals — follow-on once each portal actually wires in customer login.
- Does not replace the service-to-service scoped-API-key pattern.

## 5. Versioning & change process

- Semver. Any change to the claim shape in §2 or the `verify()` /
  `requireAuth()` / `requireRole()` signatures is a breaking change:
  requires sign-off from all four portal TEs, ships as a new major
  version with a documented migration note in `CHANGELOG.md`.
- Non-breaking additions (e.g. a new optional claim) ship as a minor
  version.
