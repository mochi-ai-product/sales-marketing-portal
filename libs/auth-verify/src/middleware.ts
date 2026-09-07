import { NextFunction, Request, Response } from 'express';
import { AuthError } from './errors';
import { AuthClaims, Verifier } from './types';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthClaims;
    }
  }
}

const STATUS_BY_REASON: Record<string, number> = {
  missing_token: 401,
  malformed_token: 401,
  invalid_signature: 401,
  expired_token: 401,
  invalid_claims: 401,
  insufficient_role: 403,
  config_error: 500,
};

/**
 * Verifies the `Authorization: Bearer <jwt>` header and attaches the
 * normalized claims to `req.auth`. Responds 401 on any verification
 * failure. Does not read `x-organization-id` - customer-facing routes
 * must use `req.auth.organizationId`, per the cross-portal multi-tenancy
 * refinement (service-to-service calls keep using the header + API key).
 */
export function requireAuth(verifier: Verifier) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      res.status(401).json({ error: 'unauthorized', reason: 'missing_token' });
      return;
    }

    try {
      req.auth = await verifier.verify(token);
      next();
    } catch (err) {
      const authErr = err instanceof AuthError ? err : new AuthError('malformed_token');
      res
        .status(STATUS_BY_REASON[authErr.reason] ?? 401)
        .json({ error: 'unauthorized', reason: authErr.reason });
    }
  };
}

/**
 * Restricts a route to one or more roles within the caller's
 * organization. Must run after `requireAuth`.
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.auth?.role;
    if (!role || !allowedRoles.includes(role)) {
      res.status(403).json({ error: 'forbidden', reason: 'insufficient_role', allowedRoles });
      return;
    }
    next();
  };
}
