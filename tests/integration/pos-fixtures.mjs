import assert from 'node:assert/strict';
import { inventoryFixture, inventoryCall } from './inventory-fixtures.mjs';

export async function posFixture() {
  const fixture = await inventoryFixture();
  try {
    const call = (
      path,
      method = 'GET',
      body,
      key,
      user = fixture.owner,
      headers = {},
    ) => inventoryCall(user, fixture.base + path, method, body, key, headers);
    const terminal = await call('/pos/terminals', 'POST', {
      branch_id: fixture.branch,
      code: 'POS-1',
      name: 'Main terminal',
      stock_location_id: fixture.shelf.id,
      status: 'ACTIVE',
    });
    assert.equal(terminal.status, 201, JSON.stringify(terminal.error));
    const barcode = await call(
      `/products/${fixture.variant.product_id}/variants/${fixture.variant.id}/barcodes`,
      'POST',
      {
        code: 'POS-TEST-001',
        symbology: 'CODE128',
        source: 'MANUFACTURER',
        is_primary: true,
      },
    );
    assert.equal(barcode.status, 201, JSON.stringify(barcode.error));
    for (const [location, items] of [
      [
        fixture.shelf,
        [
          [fixture.variant, '5'],
          [fixture.variant2, '5'],
          [fixture.weightVariant, '3.125'],
        ],
      ],
      [fixture.warehouse, [[fixture.variant, '100']]],
    ]) {
      const result = await call('/inventory/opening-balances', 'POST', {
        location_id: location.id,
        reason_code: 'POS_TEST',
        notes: 'Phase 3 fixture',
        items: items.map(([variant, quantity]) => ({
          variant_id: variant.id,
          quantity,
        })),
      });
      assert.equal(result.status, 201, JSON.stringify(result.error));
    }
    return { ...fixture, call, terminal: terminal.data };
  } catch (problem) {
    fixture.close();
    throw problem;
  }
}
