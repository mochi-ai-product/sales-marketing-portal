// Edit / deactivate / reactivate a single product (MOCAAAAAAAA-64). No
// DELETE handler here on purpose: deactivating (active: false) is the only
// supported removal path - the row must stay intact forever because sale
// line items snapshot name/priceCents rather than live-referencing it.
import { NextResponse } from 'next/server';
import { requireAuth, requireRole } from '../../../../lib/auth';
import { getPrismaClient, type PrismaClient } from '../../../../lib/db';

const ALLOWED_ROLES = ['owner', 'staff'];

export async function PATCH(request: Request, context: { params: { id: string } }) {
  return handlePatch(request, context.params.id, getPrismaClient());
}

export async function handlePatch(request: Request, id: string, prisma: PrismaClient) {
  const authResult = await requireAuth(request);
  if (authResult.response) return authResult.response;
  const { auth } = authResult;

  const roleError = requireRole(auth, ...ALLOWED_ROLES);
  if (roleError) return roleError;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest('invalid_json');
  }

  const parsed = parseProductUpdate(body);
  if (!parsed.ok) return badRequest(parsed.reason);
  if (Object.keys(parsed.value).length === 0) return badRequest('empty_update');

  // Scope the lookup by organizationId, not just id, so one org can never
  // edit/deactivate another org's product via a guessed/leaked id.
  const existing = await prisma.product.findFirst({
    where: { id, organizationId: auth.organizationId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const product = await prisma.product.update({
    where: { id },
    data: parsed.value,
  });

  return NextResponse.json({ product });
}

type ParsedProductUpdate = { name?: string; priceCents?: number; active?: boolean };
type ParseResult = { ok: true; value: ParsedProductUpdate } | { ok: false; reason: string };

export function parseProductUpdate(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: 'invalid_body' };
  }
  const { name, priceCents, active } = body as Record<string, unknown>;
  const value: ParsedProductUpdate = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return { ok: false, reason: 'invalid_name' };
    }
    value.name = name.trim();
  }

  if (priceCents !== undefined) {
    if (typeof priceCents !== 'number' || !Number.isInteger(priceCents) || priceCents < 0) {
      return { ok: false, reason: 'invalid_priceCents' };
    }
    value.priceCents = priceCents;
  }

  if (active !== undefined) {
    if (typeof active !== 'boolean') {
      return { ok: false, reason: 'invalid_active' };
    }
    value.active = active;
  }

  return { ok: true, value };
}

function badRequest(reason: string): NextResponse {
  return NextResponse.json({ error: 'bad_request', reason }, { status: 400 });
}
