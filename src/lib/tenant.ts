// Multi-tenancy convention for this portal (decided MOCAAAAAAAA-25, applies
// company-wide): single-DB, organizationId-scoped rows.
//
//   - Service-to-service calls (other portals calling into this one):
//     organizationId comes from the `x-organization-id` header, and the
//     caller must present a scoped API key (`x-api-key`) that is entitled to
//     that organization. Never trust the header alone.
//   - Customer-facing routes: organizationId MUST be derived from the
//     verified JWT claim, not from any client-supplied header - a
//     client-supplied org header on a customer-facing route is a
//     tenant-isolation bypass. Use `requireAuth()` from `src/lib/auth.ts`
//     (wraps the shared @ad-tech/auth-verify package, vendored at
//     libs/auth-verify per MOCAAAAAAAA-33) and read `result.auth.organizationId`.
//     Do not add a header-based fallback to that path.

export class TenantContextError extends Error {}

export interface ServiceCallerContext {
  organizationId: string;
  apiKey: string;
}

/**
 * Resolve tenant context for a service-to-service request. Throws
 * TenantContextError if the required header/key are missing - callers should
 * turn that into a 400/401 response.
 *
 * Scoped-key validation (mapping apiKey -> allowed organizationId(s)) is
 * deliberately not implemented here yet: this portal has no live
 * service-to-service consumers to validate against. Wire it up against the
 * real key store when the first cross-portal integration lands, following
 * Talent Management's CONTRACT.md pattern (MOCAAAAAAAA-7).
 */
export function getServiceCallerContext(headers: Headers): ServiceCallerContext {
  const organizationId = headers.get("x-organization-id");
  const apiKey = headers.get("x-api-key");

  if (!organizationId) {
    throw new TenantContextError("Missing required x-organization-id header");
  }
  if (!apiKey) {
    throw new TenantContextError("Missing required x-api-key header");
  }

  return { organizationId, apiKey };
}
