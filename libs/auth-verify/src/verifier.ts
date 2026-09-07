import { createRemoteJWKSet, jwtVerify, errors as joseErrors, JWTPayload } from 'jose';
import { AuthError } from './errors';
import { AuthClaims, Verifier, VerifierConfig } from './types';

function assertClaims(payload: JWTPayload): AuthClaims {
  const { sub, organizationId, role } = payload as Record<string, unknown>;

  if (typeof sub !== 'string' || sub.length === 0) {
    throw new AuthError('invalid_claims', 'missing or invalid `sub` claim');
  }
  if (typeof organizationId !== 'string' || organizationId.length === 0) {
    throw new AuthError('invalid_claims', 'missing or invalid `organizationId` claim');
  }
  if (typeof role !== 'string' || role.length === 0) {
    throw new AuthError('invalid_claims', 'missing or invalid `role` claim');
  }

  return { sub, organizationId, role, raw: payload as Record<string, unknown> };
}

/**
 * Builds a Verifier from a VerifierConfig. Exactly one of `jwksUrl`
 * (production - RS256 against the identity provider's JWKS) or
 * `devSharedSecret` (local/CI only - HS256) must be set.
 */
export function createVerifier(config: VerifierConfig): Verifier {
  if (config.devSharedSecret && process.env.NODE_ENV === 'production') {
    throw new AuthError(
      'config_error',
      'devSharedSecret must not be used when NODE_ENV=production - configure jwksUrl instead',
    );
  }
  if (!config.jwksUrl && !config.devSharedSecret) {
    throw new AuthError('config_error', 'one of jwksUrl or devSharedSecret is required');
  }
  if (config.jwksUrl && config.devSharedSecret) {
    throw new AuthError('config_error', 'jwksUrl and devSharedSecret are mutually exclusive');
  }

  const clockTolerance = config.clockToleranceSeconds ?? 5;
  const verifyOptions = {
    issuer: config.issuer,
    audience: config.audience,
    clockTolerance,
  };

  if (config.devSharedSecret) {
    const key = new TextEncoder().encode(config.devSharedSecret);
    return {
      async verify(token: string): Promise<AuthClaims> {
        if (!token) throw new AuthError('missing_token');
        try {
          const { payload } = await jwtVerify(token, key, {
            ...verifyOptions,
            algorithms: ['HS256'],
          });
          return assertClaims(payload);
        } catch (err) {
          throw toAuthError(err);
        }
      },
    };
  }

  const jwks = createRemoteJWKSet(new URL(config.jwksUrl as string));
  return {
    async verify(token: string): Promise<AuthClaims> {
      if (!token) throw new AuthError('missing_token');
      try {
        const { payload } = await jwtVerify(token, jwks, {
          ...verifyOptions,
          algorithms: ['RS256'],
        });
        return assertClaims(payload);
      } catch (err) {
        throw toAuthError(err);
      }
    },
  };
}

function toAuthError(err: unknown): AuthError {
  if (err instanceof AuthError) return err;
  if (err instanceof joseErrors.JWTExpired) {
    return new AuthError('expired_token', err.message);
  }
  if (
    err instanceof joseErrors.JWSSignatureVerificationFailed ||
    err instanceof joseErrors.JWTClaimValidationFailed
  ) {
    return new AuthError('invalid_signature', err.message);
  }
  const message = err instanceof Error ? err.message : String(err);
  return new AuthError('malformed_token', message);
}

/** Reads jwksUrl/issuer/audience/devSharedSecret from AUTH_* env vars. */
export function verifierConfigFromEnv(): VerifierConfig {
  const issuer = process.env.AUTH_ISSUER;
  const audience = process.env.AUTH_AUDIENCE;
  if (!issuer || !audience) {
    throw new AuthError('config_error', 'AUTH_ISSUER and AUTH_AUDIENCE env vars are required');
  }
  return {
    issuer,
    audience,
    jwksUrl: process.env.AUTH_JWKS_URL,
    devSharedSecret: process.env.AUTH_DEV_SHARED_SECRET,
  };
}
