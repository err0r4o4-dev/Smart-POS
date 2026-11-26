import assert from 'node:assert/strict';
import { posFixture } from './pos-fixtures.mjs';

export async function returnsFixture() {
  const fixture = await posFixture();
  const { call, owner, terminal, variant } = fixture;
  async function ok(
    path,
    method = 'GET',
    body,
    key,
    user = owner,
    status = method === 'POST' ? 201 : 200,
  ) {
    const response = await call(path, method, body, key, user);
    assert.equal(
      response.status,
      status,
      path + ': ' + JSON.stringify(response.error),
    );
    return response.data;
  }
  try {
    const shift = await ok('/pos/shifts/open', 'POST', {
      terminal_id: terminal.id,
      opening_cash: '100.00',
    });
    async function sale(items = [[variant, '3']]) {
      let cart = await ok('/pos/carts', 'POST', { terminal_id: terminal.id });
      cart = await ok(`/pos/carts/${cart.id}`, 'PATCH', {
        revision: cart.revision,
        items: items.map(([item, quantity]) => ({
          variant_id: item.id,
          quantity,
        })),
      });
      const checkout = await ok('/pos/checkout', 'POST', {
        cart_id: cart.id,
        revision: cart.revision,
        method: 'CASH',
        expected_total: cart.total,
        received: cart.total,
      });
      await ok(
        `/pos/payments/${checkout.id}/confirm`,
        'POST',
        { acknowledged: true, reference: '' },
        undefined,
        owner,
        200,
      );
      const completed = await ok(
        `/pos/checkouts/${checkout.id}/complete`,
        'POST',
        {},
        undefined,
        owner,
        200,
      );
      return ok(`/returns/sales/${completed.sale_id}`);
    }
    return { ...fixture, ok, shift, sale };
  } catch (error) {
    fixture.close();
    throw error;
  }
}
