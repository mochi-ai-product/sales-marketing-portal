import express, { Express } from 'express';
import request from 'supertest';
import { requireAuth, requireRole } from '../middleware';
import { AuthError } from '../errors';
import { AuthClaims, Verifier } from '../types';

function buildApp(verifier: Verifier): Express {
  const app = express();
  app.get('/whoami', requireAuth(verifier), (req, res) => {
    res.json({ auth: req.auth });
  });
  app.get(
    '/admin-only',
    requireAuth(verifier),
    requireRole('admin'),
    (_req, res) => {
      res.json({ ok: true });
    },
  );
  return app;
}

const validClaims: AuthClaims = {
  sub: 'user_1',
  organizationId: 'org_1',
  role: 'staff',
  raw: { sub: 'user_1', organizationId: 'org_1', role: 'staff' },
};

describe('requireAuth', () => {
  it('attaches req.auth and calls next on a valid token', async () => {
    const verifier: Verifier = { verify: jest.fn().mockResolvedValue(validClaims) };
    const app = buildApp(verifier);

    const res = await request(app).get('/whoami').set('authorization', 'Bearer good-token');

    expect(res.status).toBe(200);
    expect(res.body.auth).toMatchObject({ sub: 'user_1', organizationId: 'org_1', role: 'staff' });
    expect(verifier.verify).toHaveBeenCalledWith('good-token');
  });

  it('returns 401 when the Authorization header is missing', async () => {
    const verifier: Verifier = { verify: jest.fn() };
    const app = buildApp(verifier);

    const res = await request(app).get('/whoami');

    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('missing_token');
    expect(verifier.verify).not.toHaveBeenCalled();
  });

  it('returns 401 when the scheme is not Bearer', async () => {
    const verifier: Verifier = { verify: jest.fn() };
    const app = buildApp(verifier);

    const res = await request(app).get('/whoami').set('authorization', 'Basic abc');

    expect(res.status).toBe(401);
  });

  it('maps verifier rejection reasons to response bodies', async () => {
    const verifier: Verifier = {
      verify: jest.fn().mockRejectedValue(new AuthError('expired_token')),
    };
    const app = buildApp(verifier);

    const res = await request(app).get('/whoami').set('authorization', 'Bearer expired');

    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('expired_token');
  });

  it('does not fall back to an x-organization-id header - claims come only from the verified token', async () => {
    const verifier: Verifier = { verify: jest.fn().mockResolvedValue(validClaims) };
    const app = buildApp(verifier);

    const res = await request(app)
      .get('/whoami')
      .set('authorization', 'Bearer good-token')
      .set('x-organization-id', 'org_attacker_supplied');

    expect(res.body.auth.organizationId).toBe('org_1');
  });
});

describe('requireRole', () => {
  it('allows a matching role', async () => {
    const verifier: Verifier = {
      verify: jest.fn().mockResolvedValue({ ...validClaims, role: 'admin' }),
    };
    const app = buildApp(verifier);

    const res = await request(app).get('/admin-only').set('authorization', 'Bearer good-token');

    expect(res.status).toBe(200);
  });

  it('rejects a non-matching role with 403', async () => {
    const verifier: Verifier = { verify: jest.fn().mockResolvedValue(validClaims) };
    const app = buildApp(verifier);

    const res = await request(app).get('/admin-only').set('authorization', 'Bearer good-token');

    expect(res.status).toBe(403);
    expect(res.body.reason).toBe('insufficient_role');
  });
});
