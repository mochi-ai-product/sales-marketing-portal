/**
 * Normalized claims every portal can rely on, regardless of identity
 * provider. See CONTRACT.md for the full JWT contract.
 */
export interface AuthClaims {
  /** Identity-provider user id (JWT `sub`). */
  sub: string;
  /** Tenant the caller is currently acting in. */
  organizationId: string;
  /** Opaque role string, scoped to `organizationId`. Portals define their own permitted role sets. */
  role: string;
  /** Raw decoded JWT payload, for portal-specific claims beyond the shared contract. */
  raw: Record<string, unknown>;
}

export interface VerifierConfig {
  /** Expected `iss` claim. */
  issuer: string;
  /** Expected `aud` claim. */
  audience: string;
  /**
   * JWKS endpoint of the identity provider (RS256 verification). Required
   * unless `devSharedSecret` is set. Refreshed/cached automatically.
   */
  jwksUrl?: string;
  /**
   * HS256 shared-secret verification for local dev / CI / staging before
   * an identity-provider account exists. Never enable in production - the
   * verifier throws on construction if this is set while
   * `process.env.NODE_ENV === 'production'`.
   */
  devSharedSecret?: string;
  /** Clock-skew tolerance in seconds. Defaults to 5. */
  clockToleranceSeconds?: number;
}

export interface Verifier {
  /** Verifies a raw JWT string and returns normalized claims, or throws AuthError. */
  verify(token: string): Promise<AuthClaims>;
}
