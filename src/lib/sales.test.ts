import { describe, expect, it } from 'vitest';
import { computeTotalCents, priceLineItems, SaleValidationError } from './sales';

const HAIRCUT = { id: 'prod_haircut', name: 'Haircut', priceCents: 5000 };
const FACIAL = { id: 'prod_facial', name: 'Deep Cleanse Facial', priceCents: 12000 };

describe('priceLineItems', () => {
  it('snapshots product name and price at the given quantity', () => {
    const result = priceLineItems([HAIRCUT], [{ productId: 'prod_haircut', quantity: 2 }]);

    expect(result).toEqual([
      {
        productId: 'prod_haircut',
        productNameSnapshot: 'Haircut',
        unitPriceCentsSnapshot: 5000,
        quantity: 2,
        lineTotalCents: 10000,
      },
    ]);
  });

  it('prices multiple distinct line items independently', () => {
    const result = priceLineItems(
      [HAIRCUT, FACIAL],
      [
        { productId: 'prod_haircut', quantity: 1 },
        { productId: 'prod_facial', quantity: 1 },
      ],
    );

    expect(result.map((r) => r.lineTotalCents)).toEqual([5000, 12000]);
  });

  it('is unaffected by a product name/price mutation after pricing (snapshot, not live reference)', () => {
    const mutableProduct = { id: 'prod_haircut', name: 'Haircut', priceCents: 5000 };
    const result = priceLineItems([mutableProduct], [{ productId: 'prod_haircut', quantity: 1 }]);

    mutableProduct.name = 'Haircut (renamed)';
    mutableProduct.priceCents = 9999;

    expect(result[0]).toMatchObject({ productNameSnapshot: 'Haircut', unitPriceCentsSnapshot: 5000 });
  });

  it('rejects an empty line item list', () => {
    expect(() => priceLineItems([HAIRCUT], [])).toThrow(SaleValidationError);
  });

  it('rejects a line item referencing an unknown product', () => {
    expect(() => priceLineItems([HAIRCUT], [{ productId: 'does_not_exist', quantity: 1 }])).toThrow(
      SaleValidationError,
    );
  });

  it('rejects a zero quantity', () => {
    expect(() => priceLineItems([HAIRCUT], [{ productId: 'prod_haircut', quantity: 0 }])).toThrow(
      SaleValidationError,
    );
  });

  it('rejects a negative quantity', () => {
    expect(() => priceLineItems([HAIRCUT], [{ productId: 'prod_haircut', quantity: -1 }])).toThrow(
      SaleValidationError,
    );
  });

  it('rejects a non-integer quantity', () => {
    expect(() => priceLineItems([HAIRCUT], [{ productId: 'prod_haircut', quantity: 1.5 }])).toThrow(
      SaleValidationError,
    );
  });

  it('rejects a missing productId', () => {
    expect(() => priceLineItems([HAIRCUT], [{ productId: undefined, quantity: 1 }])).toThrow(SaleValidationError);
  });
});

describe('computeTotalCents', () => {
  it('sums line item totals', () => {
    expect(computeTotalCents([{ lineTotalCents: 5000 }, { lineTotalCents: 12000 }])).toBe(17000);
  });

  it('returns 0 for no line items', () => {
    expect(computeTotalCents([])).toBe(0);
  });
});
