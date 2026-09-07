import { SignJWT, generateKeyPair, exportJWK, JWK } from 'jose';
import * as http from 'http';
import { AddressInfo } from 'net';
import { createVerifier } from '../verifier';
import { AuthError } from '../errors';

const ISSUER = 'https://auth.ad-technologies.test/';
const AUDIENCE = 'ad-tech-portals';

describe('createVerifier - RS256 via JWKS', () => {
  let server: http.Server;
  let jwksUrl: string;
  let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  let kid: string;

  beforeAll(async () => {
    const { publicKey, privateKey: priv } = await generateKeyPair('RS256');
    privateKey = priv;
    const jwk: JWK = await exportJWK(publicKey);
    kid = 'test-key-1';
    jwk.kid = kid;
    jwk.alg = 'RS256';
    jwk.use = 'sig';

    server = http.createServer((_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ keys: [jwk] }));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    jwksUrl = `http://127.0.0.1:${port}/jwks.json`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function signToken(claims: Record<string, unknown>, opts?: { expiresIn?: string }) {
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(opts?.expiresIn ?? '5m')
      .sign(privateKey);
  }

  it('verifies a valid token and normalizes claims', async () => {
    const verifier = createVerifier({ issuer: ISSUER, audience: AUDIENCE, jwksUrl });
    const token = await signToken({ sub: 'user_1', organizationId: 'org_1', role: 'admin' });

    const claims = await verifier.verify(token);

    expect(claims).toMatchObject({ sub: 'user_1', organizationId: 'org_1', role: 'admin' });
    expect(claims.raw.iss).toBe(ISSUER);
  });

  it('rejects an expired token', async () => {
    const verifier = createVerifier({ issuer: ISSUER, audience: AUDIENCE, jwksUrl });
    const token = await signToken(
      { sub: 'user_1', organizationId: 'org_1', role: 'admin' },
      { expiresIn: '-1h' },
    );

    await expect(verifier.verify(token)).rejects.toMatchObject({ reason: 'expired_token' });
  });

  it('rejects a token from the wrong issuer', async () => {
    const verifier = createVerifier({ issuer: ISSUER, audience: AUDIENCE, jwksUrl });
    const token = await new SignJWT({ sub: 'user_1', organizationId: 'org_1', role: 'admin' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer('https://not-us.test/')
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    await expect(verifier.verify(token)).rejects.toBeInstanceOf(AuthError);
  });

  it('rejects a token missing organizationId', async () => {
    const verifier = createVerifier({ issuer: ISSUER, audience: AUDIENCE, jwksUrl });
    const token = await signToken({ sub: 'user_1', role: 'admin' });

    await expect(verifier.verify(token)).rejects.toMatchObject({ reason: 'invalid_claims' });
  });

  it('rejects a malformed token', async () => {
    const verifier = createVerifier({ issuer: ISSUER, audience: AUDIENCE, jwksUrl });
    await expect(verifier.verify('not-a-jwt')).rejects.toBeInstanceOf(AuthError);
  });

  it('rejects an empty token as missing_token', async () => {
    const verifier = createVerifier({ issuer: ISSUER, audience: AUDIENCE, jwksUrl });
    await expect(verifier.verify('')).rejects.toMatchObject({ reason: 'missing_token' });
  });
});

describe('createVerifier - HS256 dev shared secret', () => {
  const secret = 'dev-only-shared-secret-not-for-production';

  it('verifies a valid token signed with the shared secret', async () => {
    const verifier = createVerifier({ issuer: ISSUER, audience: AUDIENCE, devSharedSecret: secret });
    const key = new TextEncoder().encode(secret);
    const token = await new SignJWT({ sub: 'user_2', organizationId: 'org_2', role: 'staff' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(key);

    const claims = await verifier.verify(token);
    expect(claims).toMatchObject({ sub: 'user_2', organizationId: 'org_2', role: 'staff' });
  });

  it('refuses to construct with devSharedSecret when NODE_ENV=production', () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() =>
        createVerifier({ issuer: ISSUER, audience: AUDIENCE, devSharedSecret: secret }),
      ).toThrow(AuthError);
    } finally {
      process.env.NODE_ENV = original;
    }
  });

  it('requires exactly one of jwksUrl or devSharedSecret', () => {
    expect(() => createVerifier({ issuer: ISSUER, audience: AUDIENCE })).toThrow(AuthError);
    expect(() =>
      createVerifier({
        issuer: ISSUER,
        audience: AUDIENCE,
        jwksUrl: 'https://x.test/jwks.json',
        devSharedSecret: secret,
      }),
    ).toThrow(AuthError);
  });
});
