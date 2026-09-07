# Changelog

## 0.1.0 — 2026-09-07

Initial pilot release, per
[MOCAAAAAAAA-27](/MOCAAAAAAAA/issues/MOCAAAAAAAA-27).

- `createVerifier(config)` — RS256-via-JWKS verification for production,
  HS256 shared-secret verification for local dev/CI (refuses to run under
  `NODE_ENV=production`).
- `requireAuth(verifier)` — Express middleware; attaches `req.auth =
  { sub, organizationId, role, raw }` on success, 401 on failure. Never
  reads `x-organization-id` — customer-facing routes get `organizationId`
  only from the verified token.
- `requireRole(...roles)` — Express middleware; 403 if the caller's role
  isn't in the allowed set.
- `verifierConfigFromEnv()` — reads `AUTH_ISSUER` / `AUTH_AUDIENCE` /
  `AUTH_JWKS_URL` / `AUTH_DEV_SHARED_SECRET`.
- Vendor pick: WorkOS (User Management + AuthKit) — see `README.md`.
- 16 tests covering valid/expired/wrong-issuer/malformed/missing tokens,
  both verification modes, and the role-restriction middleware.

**Known gaps, not blocking this release:**
- No production WorkOS account/AuthKit app exists yet — needs a human
  with account/billing authority. `AUTH_DEV_SHARED_SECRET` unblocks
  integration work in the meantime.
- No shared package registry — see `README.md` "Install" for the vendoring
  workaround.
- No cross-portal role taxonomy — each portal defines its own role
  strings for now (see `CONTRACT.md` §2).
