import { describe, expect, it } from 'vitest';
import { GET } from './route';

describe('GET /api/health', () => {
  it('reports ok status for this portal', async () => {
    const res = GET();
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.portal).toBe('sales-marketing');
  });
});
