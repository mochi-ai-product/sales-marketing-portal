import { SignJWT } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '../../../../lib/db';
import { handlePatch, parseProductUpdate } from './route';

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

function patchRequest(headers: Record<string, string>, body: unknown): Request {
  return new Request('https://portal.test/api/products/p1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function fakePrisma(overrides: Partial<{ findFirst: unknown; update: unknown }> = {}) {
  return {
    product: {
      findFirst: overrides.findFirst ?? vi.fn().mockResolvedValue({ id: 'p1', organizationId: 'org_1' }),
      update: overrides.update ?? vi.fn().mockResolvedValue({ id: 'p1' }),
    },
  } as unknown as PrismaClient;
}

describe('PATCH /api/products/[id]', () => {
  it('rejects requests without a bearer token', async () => {
    const res = await handlePatch(patchRequest({}, { active: false }), 'p1', fakePrisma());
    expect(res.status).toBe(401);
  });

  it('404s when the product does not belong to the caller organizationId', async () => {
    const token = await signToken({ sub: 'u1', organizationId: 'org_2', role: 'owner' });
    const findFirst = vi.fn().mockResolvedValue(null);

    const res = await handlePatch(
      patchRequest({ authorization: `Bearer ${token}` }, { active: false }),
      'p1',
      fakePrisma({ findFirst }),
    );

    expect(res.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith({ where: { id: 'p1', organizationId: 'org_2' } });
  });

  it('deactivates a product without deleting the row (soft-deactivate only)', async () => {
    const token = await signToken({ sub: 'u1', organizationId: 'org_1', role: 'owner' });
    const update = vi.fn().mockResolvedValue({ id: 'p1', active: false });

    const res = await handlePatch(
      patchRequest({ authorization: `Bearer ${token}` }, { active: false }),
      'p1',
      fakePrisma({ update }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.product.active).toBe(false);
    expect(update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { active: false } });
  });

  it('edits name and price without touching active', async () => {
    const token = await signToken({ sub: 'u1', organizationId: 'org_1', role: 'staff' });
    const update = vi.fn().mockResolvedValue({ id: 'p1', name: 'Deluxe Facial', priceCents: 20000 });

    await handlePatch(
      patchRequest({ authorization: `Bearer ${token}` }, { name: 'Deluxe Facial', priceCents: 20000 }),
      'p1',
      fakePrisma({ update }),
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { name: 'Deluxe Facial', priceCents: 20000 },
    });
  });

  it('rejects an empty update body', async () => {
    const token = await signToken({ sub: 'u1', organizationId: 'org_1', role: 'owner' });

    const res = await handlePatch(patchRequest({ authorization: `Bearer ${token}` }, {}), 'p1', fakePrisma());

    expect(res.status).toBe(400);
  });
});

describe('parseProductUpdate', () => {
  it('only includes provided, valid fields', () => {
    expect(parseProductUpdate({ active: false })).toEqual({ ok: true, value: { active: false } });
    expect(parseProductUpdate({ name: ' New Name ' })).toEqual({ ok: true, value: { name: 'New Name' } });
    expect(parseProductUpdate({ active: 'nope' }).ok).toBe(false);
    expect(parseProductUpdate({ priceCents: -1 }).ok).toBe(false);
  });
});
