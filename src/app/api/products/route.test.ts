import { SignJWT } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../lib/db';
import { handleGet, handlePost, parseProductInput } from './route';

// Same HS256 dev-shared-secret setup as src/lib/auth.test.ts - the default
// verifier reads AUTH_* env vars, and createVerifier refuses devSharedSecret
// under NODE_ENV=production (this shell defaults to production).
const ISSUER = 'https://auth.ad-technologies.test/';
const AUDIENCE = 'ad-tech-portals';
const SECRET = 'dev-only-shared-secret-not-for-production';

beforeAll(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('AUTH_ISSUER', ISSUER);
  vi.stubEnv('AUTH_AUDIENCE', AUDIENCE);
  vi.stubEnv('AUTH_DEV_SHARED_SECRET', SECRET);
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

function requestWith(headers: Record<string, string>, init?: RequestInit): Request {
  return new Request('https://portal.test/api/products', { headers, ...init });
}

function fakePrisma(overrides: Partial<{ findMany: unknown; create: unknown }> = {}) {
  return {
    product: {
      findMany: overrides.findMany ?? vi.fn().mockResolvedValue([]),
      create: overrides.create ?? vi.fn(),
    },
  } as unknown as PrismaClient;
}

describe('GET /api/products', () => {
  it('rejects requests without a bearer token', async () => {
    const res = await handleGet(requestWith({}), fakePrisma());
    expect(res.status).toBe(401);
  });

  it('rejects roles outside owner/staff', async () => {
    const token = await signToken({ sub: 'u1', organizationId: 'org_1', role: 'guest' });
    const res = await handleGet(requestWith({ authorization: `Bearer ${token}` }), fakePrisma());
    expect(res.status).toBe(403);
  });

  it('scopes the list query to the caller organizationId and defaults to active-only', async () => {
    const token = await signToken({ sub: 'u1', organizationId: 'org_1', role: 'staff' });
    const findMany = vi.fn().mockResolvedValue([{ id: 'p1', name: 'Facial', priceCents: 15000, active: true }]);

    const res = await handleGet(requestWith({ authorization: `Bearer ${token}` }), fakePrisma({ findMany }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.products).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org_1', active: true },
      orderBy: { name: 'asc' },
    });
  });

  it('includes inactive products when includeInactive=true', async () => {
    const token = await signToken({ sub: 'u1', organizationId: 'org_1', role: 'owner' });
    const findMany = vi.fn().mockResolvedValue([]);

    await handleGet(
      new Request('https://portal.test/api/products?includeInactive=true', {
        headers: { authorization: `Bearer ${token}` },
      }),
      fakePrisma({ findMany }),
    );

    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org_1' },
      orderBy: { name: 'asc' },
    });
  });
});

describe('POST /api/products', () => {
  it('creates a product scoped to the caller organizationId', async () => {
    const token = await signToken({ sub: 'u1', organizationId: 'org_1', role: 'owner' });
    const create = vi.fn().mockResolvedValue({ id: 'p1', organizationId: 'org_1', name: 'Facial', priceCents: 15000, active: true });

    const res = await handlePost(
      requestWith(
        { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        { method: 'POST', body: JSON.stringify({ name: 'Facial', priceCents: 15000 }) },
      ),
      fakePrisma({ create }),
    );
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.product.name).toBe('Facial');
    expect(create).toHaveBeenCalledWith({
      data: { organizationId: 'org_1', name: 'Facial', priceCents: 15000 },
    });
  });

  it('rejects an invalid body with 400', async () => {
    const token = await signToken({ sub: 'u1', organizationId: 'org_1', role: 'owner' });

    const res = await handlePost(
      requestWith(
        { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        { method: 'POST', body: JSON.stringify({ name: '', priceCents: -5 }) },
      ),
      fakePrisma(),
    );

    expect(res.status).toBe(400);
  });
});

describe('parseProductInput', () => {
  it('trims the name and requires a non-negative integer priceCents', () => {
    expect(parseProductInput({ name: '  Facial  ', priceCents: 15000 })).toEqual({
      ok: true,
      value: { name: 'Facial', priceCents: 15000 },
    });
    expect(parseProductInput({ name: 'Facial', priceCents: 12.5 }).ok).toBe(false);
    expect(parseProductInput({ name: '', priceCents: 100 }).ok).toBe(false);
    expect(parseProductInput({ name: 'Facial', priceCents: -1 }).ok).toBe(false);
  });
});
