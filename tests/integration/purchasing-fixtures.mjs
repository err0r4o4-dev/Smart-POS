import assert from 'node:assert/strict';
import { posFixture } from './pos-fixtures.mjs';

export async function purchasingFixture() {
  const fixture = await posFixture();
  try {
    const supplier = await fixture.call('/suppliers', 'POST', {
      code: 'SUP-ONE',
      name: 'Phase 4 Supplier',
      contact_person: 'Receiving desk',
      email: '',
      phone: '',
      address: '',
      tax_identifier: '',
      notes: '',
      status: 'ACTIVE',
    });
    assert.equal(supplier.status, 201, JSON.stringify(supplier.error));
    for (const variant of [
      fixture.variant,
      fixture.variant2,
      fixture.weightVariant,
    ]) {
      const link = await fixture.call(
        `/suppliers/${supplier.data.id}/products`,
        'POST',
        {
          variant_id: variant.id,
          purchase_unit_id: variant.unit_id,
          supplier_sku: 'SUP-' + variant.sku,
          unit_cost: '12.00',
          minimum_order_quantity: '1',
          order_multiple: '1',
          lead_time_days: 3,
          is_preferred: true,
          status: 'ACTIVE',
        },
      );
      assert.equal(link.status, 201, JSON.stringify(link.error));
    }
    return { ...fixture, supplier: supplier.data };
  } catch (error) {
    fixture.close();
    throw error;
  }
}
