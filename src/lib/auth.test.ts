import { SignJWT } from 'jose';
import { createVerifier, type Verifier } from '@ad-tech/auth-verify';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { requireAuth, requireRole } from './auth';

const ISSUER = 'https://auth.ad-technologies.test/';
const AUDIENCE = 'ad-tech-portals';
const SECRET = 'dev-only-shared-secret-not-for-production';

// createVerifier refuses devSharedSecret under NODE_ENV=production (by design -
// see CONTRACT.md §2); this shell defaults NODE_ENV=production, so stub it for
// this test file the same way libs/auth-verify's own test suite does.
let verifier: Verifier;

beforeAll(() => {
  vi.stubEnv('NODE_ENV', 'test');
  verifier = createVerifier({ issuer: ISSUER, audience: AUDIENCE, devSharedSecret: SECRET });
});

async function signToken(claims: Record<string, unknown>) {
  const key = new TextEncoder().encode(SECRET);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

function requestWith(headers: Record<string, string>): Request {
  return new Request('https://portal.test/v1/me', { headers });
}

describe('requireAuth', () => {
  it('returns the verified claims for a valid bearer token', async () => {
    const token = await signToken({ sub: 'user_1', organizationId: 'org_1', role: 'admin' });

    const result = await requireAuth(requestWith({ authorization: `Bearer ${token}` }), verifier);

    expect(result.response).toBeUndefined();
    expect(result.auth).toMatchObject({ sub: 'user_1', organizationId: 'org_1', role: 'admin' });
  });

  it('returns a 401 response when the Authorization header is missing', async () => {
    const result = await requireAuth(requestWith({}), verifier);

    expect(result.auth).toBeUndefined();
    expect(result.response?.status).toBe(401);
    expect((await result.response?.json()).reason).toBe('missing_token');
  });

  it('ignores a client-supplied x-organization-id header - organizationId comes only from the token', async () => {
    const token = await signToken({ sub: 'user_1', organizationId: 'org_1', role: 'admin' });

    const result = await requireAuth(
      requestWith({ authorization: `Bearer ${token}`, 'x-organization-id': 'org_attacker_supplied' }),
      verifier,
    );

    expect(result.auth?.organizationId).toBe('org_1');
  });

  it('returns a 401 response for an expired token', async () => {
    const key = new TextEncoder().encode(SECRET);
    const token = await new SignJWT({ sub: 'user_1', organizationId: 'org_1', role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('-1h')
      .sign(key);

    const result = await requireAuth(requestWith({ authorization: `Bearer ${token}` }), verifier);

    expect(result.response?.status).toBe(401);
    expect((await result.response?.json()).reason).toBe('expired_token');
  });
});

describe('requireRole', () => {
  it('returns null when the role is allowed', async () => {
    const auth = { sub: 'user_1', organizationId: 'org_1', role: 'admin', raw: {} };
    expect(requireRole(auth, 'admin', 'owner')).toBeNull();
  });

  it('returns a 403 response when the role is not allowed', async () => {
    const auth = { sub: 'user_1', organizationId: 'org_1', role: 'staff', raw: {} };
    const response = requireRole(auth, 'admin', 'owner');
    expect(response?.status).toBe(403);
    expect((await response?.json()).reason).toBe('insufficient_role');
  });
});
