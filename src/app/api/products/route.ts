// Product/service catalog (MOCAAAAAAAA-64). Customer-facing route: auth and
// organizationId scoping follow the CONTRACT.md convention in
// src/lib/auth.ts / src/lib/tenant.ts - organizationId always comes from the
// verified JWT, never a client-supplied header.
//
// GET/POST are thin wrappers around handleGet/handlePost so tests can inject
// a fake PrismaClient instead of hitting a real database (same shape as
// requireAuth's injectable `verifier` param in src/lib/auth.ts).
import { NextResponse } from 'next/server';
import { requireAuth, requireRole } from '../../../lib/auth';
import { getPrismaClient, type PrismaClient } from '../../../lib/db';

// No cross-portal role taxonomy exists yet (CONTRACT.md §2) - this portal
// defines its own. Both roles may manage the catalog per MOCAAAAAAAA-64's
// acceptance criteria ("Owner/staff can create, edit, and deactivate").
const ALLOWED_ROLES = ['owner', 'staff'];

export async function GET(request: Request) {
  return handleGet(request, getPrismaClient());
}

export async function POST(request: Request) {
  return handlePost(request, getPrismaClient());
}

export async function handleGet(request: Request, prisma: PrismaClient) {
  const authResult = await requireAuth(request);
  if (authResult.response) return authResult.response;
  const { auth } = authResult;

  const roleError = requireRole(auth, ...ALLOWED_ROLES);
  if (roleError) return roleError;

  const includeInactive = new URL(request.url).searchParams.get('includeInactive') === 'true';

  const products = await prisma.product.findMany({
    where: {
      organizationId: auth.organizationId,
      ...(includeInactive ? {} : { active: true }),
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({ products });
}

export async function handlePost(request: Request, prisma: PrismaClient) {
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

  const parsed = parseProductInput(body);
  if (!parsed.ok) return badRequest(parsed.reason);

  const product = await prisma.product.create({
    data: {
      organizationId: auth.organizationId,
      name: parsed.value.name,
      priceCents: parsed.value.priceCents,
    },
  });

  return NextResponse.json({ product }, { status: 201 });
}

type ParsedProductInput = { name: string; priceCents: number };
type ParseResult = { ok: true; value: ParsedProductInput } | { ok: false; reason: string };

export function parseProductInput(body: unknown): ParseResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: 'invalid_body' };
  }
  const { name, priceCents } = body as Record<string, unknown>;

  if (typeof name !== 'string' || name.trim().length === 0) {
    return { ok: false, reason: 'invalid_name' };
  }
  if (typeof priceCents !== 'number' || !Number.isInteger(priceCents) || priceCents < 0) {
    return { ok: false, reason: 'invalid_priceCents' };
  }

  return { ok: true, value: { name: name.trim(), priceCents } };
}

function badRequest(reason: string): NextResponse {
  return NextResponse.json({ error: 'bad_request', reason }, { status: 400 });
}
