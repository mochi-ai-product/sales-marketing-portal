// Next.js App Router adapter for the shared @ad-tech/auth-verify package
// (vendored at libs/auth-verify, v0.1.0 - see MOCAAAAAAAA-33). The package
// ships Express middleware (requireAuth/requireRole); this portal has no
// Express layer, so this file re-implements the same behavior as a plain
// async helper for Route Handlers, built on the package's framework-agnostic
// createVerifier()/verify().
//
// Per CONTRACT.md §3: customer-facing routes MUST derive organizationId from
// the verified JWT only - never from a client-supplied x-organization-id
// header (that header stays for service-to-service calls, see
// src/lib/tenant.ts). This helper never reads that header.

import { NextResponse } from 'next/server';
import {
  createVerifier,
  verifierConfigFromEnv,
  AuthError,
  type AuthClaims,
  type Verifier,
} from '@ad-tech/auth-verify';

let cachedVerifier: Verifier | undefined;

function defaultVerifier(): Verifier {
  if (!cachedVerifier) {
    cachedVerifier = createVerifier(verifierConfigFromEnv());
  }
  return cachedVerifier;
}

export type AuthResult = { auth: AuthClaims; response?: undefined } | { auth?: undefined; response: NextResponse };

/**
 * Verifies the `Authorization: Bearer <jwt>` header on a customer-facing
 * Route Handler request. Returns `{ auth }` on success or `{ response }`
 * (a ready-to-return 401 NextResponse) on failure.
 *
 * `verifier` defaults to a lazily-built, process-wide verifier from
 * `AUTH_*` env vars; pass one explicitly in tests.
 */
export async function requireAuth(request: Request, verifier: Verifier = defaultVerifier()): Promise<AuthResult> {
  const header = request.headers.get('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return { response: unauthorized('missing_token') };
  }

  try {
    const auth = await verifier.verify(token);
    return { auth };
  } catch (err) {
    const reason = err instanceof AuthError ? err.reason : 'malformed_token';
    return { response: unauthorized(reason) };
  }
}

/** Returns a 403 NextResponse if `auth.role` isn't in `allowedRoles`, else null. */
export function requireRole(auth: AuthClaims, ...allowedRoles: string[]): NextResponse | null {
  if (!allowedRoles.includes(auth.role)) {
    return NextResponse.json({ error: 'forbidden', reason: 'insufficient_role', allowedRoles }, { status: 403 });
  }
  return null;
}

function unauthorized(reason: string): NextResponse {
  return NextResponse.json({ error: 'unauthorized', reason }, { status: 401 });
}
