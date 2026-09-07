// Pure pricing logic for Epic 3 extension (MOCAAAAAAAA-66): turning a
// requested set of { productId, quantity } into priced SaleLineItem rows.
// Kept free of Prisma/DB access so the money math (the highest-risk part of
// "priced line items") is unit-testable without a live database - route
// handlers own the DB lookups and pass plain data in here.
//
// Snapshot rule (MOCAAAAAAAA-64 acceptance criteria): once a line item is
// built, it must never be recomputed from a live Product row - price/name
// edits or deactivation after this point must not alter historical revenue.

export interface ProductForPricing {
  id: string;
  name: string;
  priceCents: number;
}

export interface RequestedLineItem {
  productId: unknown;
  quantity: unknown;
}

export interface PricedLineItem {
  productId: string;
  productNameSnapshot: string;
  unitPriceCentsSnapshot: number;
  quantity: number;
  lineTotalCents: number;
}

export class SaleValidationError extends Error {}

/**
 * Prices each requested line item against the given (already org-scoped)
 * product rows. Throws SaleValidationError on any malformed or unknown
 * line item - callers should turn that into a 400 response.
 */
export function priceLineItems(
  products: ProductForPricing[],
  requested: RequestedLineItem[],
): PricedLineItem[] {
  if (requested.length === 0) {
    throw new SaleValidationError('a sale requires at least one line item');
  }

  const byId = new Map(products.map((product) => [product.id, product]));

  return requested.map((item) => {
    if (typeof item.productId !== 'string' || !item.productId) {
      throw new SaleValidationError('each line item requires a productId');
    }
    if (!Number.isInteger(item.quantity) || (item.quantity as number) < 1) {
      throw new SaleValidationError(`quantity for product ${item.productId} must be a positive integer`);
    }

    const product = byId.get(item.productId);
    if (!product) {
      throw new SaleValidationError(`unknown product ${item.productId}`);
    }

    const quantity = item.quantity as number;
    return {
      productId: product.id,
      productNameSnapshot: product.name,
      unitPriceCentsSnapshot: product.priceCents,
      quantity,
      lineTotalCents: product.priceCents * quantity,
    };
  });
}

export function computeTotalCents(lineItems: Pick<PricedLineItem, 'lineTotalCents'>[]): number {
  return lineItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
}
