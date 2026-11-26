import { returnsFixture } from './returns-fixtures.mjs';

export async function adjustmentsFixture() {
  const fixture = await returnsFixture();
  try {
    let doc = await fixture.ok('/inventory/adjustments', 'POST', {
      location_id: fixture.shelf.id,
      adjustment_type: 'INCREASE',
      reason_code: 'PHASE52_FIXTURE',
      notes: 'Synthetic acceptance stock',
      items: [fixture.variant, fixture.variant2, fixture.weightVariant].map(
        (item) => ({ variant_id: item.id, quantity: '100' }),
      ),
    });
    for (const action of ['submit', 'approve', 'post'])
      doc = await fixture.ok(
        `/inventory/adjustments/${doc.id}/${action}`,
        'POST',
        { revision: doc.revision },
        undefined,
        fixture.owner,
        200,
      );
    function input(
      original,
      replacements = [[fixture.variant2, '1']],
      quantity = '1',
      destination = fixture.warehouse.id,
      disposition = 'RESTOCK_SELLABLE',
    ) {
      return {
        original_sale_id: original.id,
        reason: 'Phase 5.2 inspected synthetic adjustment',
        terminal_id: replacements.length ? fixture.terminal.id : '',
        items: original.items.map((item) => ({
          original_sale_item_id: item.id,
          quantity,
          disposition,
          destination_location_id:
            disposition === 'NO_STOCK_RETURN' ? null : destination,
        })),
        replacements: replacements.map(([item, amount]) => ({
          variant_id: item.id,
          quantity: amount,
        })),
      };
    }
    return { ...fixture, input };
  } catch (error) {
    fixture.close();
    throw error;
  }
}
