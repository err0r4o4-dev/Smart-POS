import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authSQL } from './auth-fixtures.mjs';
import { adjustmentsFixture } from './adjustments-fixtures.mjs';

const fixture = await adjustmentsFixture();
const {
  call,
  owner,
  org,
  variant,
  variant2,
  weightVariant,
  shift,
  sale,
  input,
} = fixture;
let assertions = 0;
function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  assertions++;
}
async function ok(
  path,
  method = 'GET',
  body,
  key,
  status = method === 'POST' ? 201 : 200,
) {
  const response = await call(path, method, body, key);
  equal(response.status, status, path + ': ' + JSON.stringify(response.error));
  return response.data;
}
async function action(doc, name, extra = {}, key, status = 200) {
  return ok(
    `${doc.kind === 'REVERSAL' ? '/sales/voids' : '/exchanges'}/${doc.id}/${name}`,
    'POST',
    { revision: doc.revision, ...extra },
    key,
    status,
  );
}
async function approved(doc) {
  return action(await action(doc, 'submit'), 'approve');
}
async function settle(doc, method, reference = '') {
  return action(doc, 'confirm-settlement', {
    method,
    reference,
    note: 'Operator acknowledgement only; not bank verification',
    acknowledged: true,
    shift_id: ['CASH', 'CASH_REFUND'].includes(method) ? shift.id : null,
  });
}
const count = (table) =>
  authSQL(`SELECT count(*) FROM ${table} WHERE organization_id='${org}'`);
const saleSnapshot = (id) =>
  authSQL(
    `SELECT to_jsonb(sale)::text FROM sales sale WHERE organization_id='${org}' AND id='${id}'`,
  );
try {
  const positive = await sale([[variant, '2']]);
  const body = input(positive, [[variant2, '2']], '1');
  const beforeQuote = [
    count('stock_movements'),
    count('sale_adjustments'),
    count('customer_returns'),
  ];
  const quote = await ok('/exchanges/quote', 'POST', body, undefined, 200);
  equal(quote.return_credit, '2.00');
  equal(quote.replacement_total, '4.00');
  equal(quote.net_difference, '2.00');
  equal(
    JSON.stringify([
      count('stock_movements'),
      count('sale_adjustments'),
      count('customer_returns'),
    ]),
    JSON.stringify(beforeQuote),
    'quote has no business writes',
  );
  const createKey = randomUUID();
  let draft = await ok('/exchanges', 'POST', body, createKey);
  equal(
    (await ok('/exchanges', 'POST', body, createKey)).id,
    draft.id,
    'create replay',
  );
  await ok(
    '/exchanges',
    'POST',
    { ...body, reason: 'different payload' },
    createKey,
    409,
  );
  await action(draft, 'complete', {}, undefined, 409);
  const edited = await ok(
    `/exchanges/${draft.id}`,
    'PATCH',
    { ...body, revision: draft.revision, reason: 'Revised inspection' },
    undefined,
    200,
  );
  equal(edited.revision, draft.revision + 1);
  equal(
    (await ok(`/returns/${draft.linked_return_id}`)).status,
    'CANCELLED',
    'superseded return preserved',
  );
  await ok(
    `/exchanges/${draft.id}`,
    'PATCH',
    { ...body, revision: draft.revision },
    undefined,
    409,
  );
  draft = await approved(edited);
  await action(
    draft,
    'confirm-settlement',
    { method: 'CASH', acknowledged: false, note: 'Invalid' },
    undefined,
    400,
  );
  const acknowledged = await settle(draft, 'CASH');
  await action(acknowledged, 'cancel', {}, undefined, 409);
  const originalSnapshot = saleSnapshot(positive.id);
  const cashBefore = await ok(`/pos/shifts/${shift.id}`);
  const completeKey = randomUUID();
  const completed = await action(acknowledged, 'complete', {}, completeKey);
  equal(completed.status, 'COMPLETED');
  equal(!!completed.replacement_sale_id, true);
  equal(completed.return_document.status, 'COMPLETED');
  equal(
    (await action(acknowledged, 'complete', {}, completeKey)).id,
    completed.id,
    'lost-response replay',
  );
  await action(completed, 'complete', {}, undefined, 409);
  await action(completed, 'approve', {}, undefined, 409);
  const replacement = await ok(`/sales/${completed.replacement_sale_id}`);
  equal(replacement.grand_total, '4.00');
  equal(replacement.payment.credit_amount, '2.00');
  equal(replacement.payment.amount, '2.00');
  equal(replacement.payment.received, '2.00');
  equal(replacement.payment.method, 'CASH');
  const cashAfter = await ok(`/pos/shifts/${shift.id}`);
  equal(
    (Number(cashAfter.cash_sales) - Number(cashBefore.cash_sales)).toFixed(2),
    '2.00',
    'only external net cash counted',
  );
  equal(saleSnapshot(positive.id), originalSnapshot, 'original immutable');
  equal(
    (await ok(`/returns/sales/${positive.id}`)).items[0].returnable_quantity,
    '1.000',
  );
  equal(
    (await ok(`/sales/${positive.id}`)).adjustments[0].id,
    completed.id,
    'sale navigation',
  );
  await ok(
    `/returns/${completed.linked_return_id}/complete`,
    'POST',
    { revision: completed.return_document.revision },
    undefined,
    409,
  );
  for (const [method, amount, replacementQuantity] of [
    ['NONE', '1', '1'],
    ['QR_MANUAL', '1', '2'],
    ['BANK_TRANSFER_MANUAL', '1', '2'],
    ['CASH_REFUND', '2', '1'],
    ['MANUAL_BANK_REFUND', '2', '1'],
    ['MANUAL_ORIGINAL_METHOD_REFUND', '2', '1'],
  ]) {
    const original = await sale([[variant, amount]]);
    const originalState = saleSnapshot(original.id);
    let doc = await ok(
      '/exchanges',
      'POST',
      input(original, [[variant2, replacementQuantity]], amount),
    );
    doc = await approved(doc);
    doc = await settle(
      doc,
      method,
      method.includes('MANUAL') ? 'REFERENCE-' + method : '',
    );
    const ledgerBefore = Number(count('stock_movements')),
      refundsBefore = Number(count('customer_refunds'));
    doc = await action(doc, 'complete');
    equal(doc.status, 'COMPLETED', method);
    equal(
      Number(count('stock_movements')),
      ledgerBefore + 2,
      'one return and one replacement movement',
    );
    equal(
      Number(count('customer_refunds')),
      refundsBefore + (doc.net_difference.startsWith('-') ? 1 : 0),
      'only negative net creates refund',
    );
    const saleDoc = await ok(`/sales/${doc.replacement_sale_id}`);
    if (doc.net_difference.startsWith('-') || doc.net_difference === '0.00') {
      equal(saleDoc.payment.method, 'EXCHANGE_CREDIT');
      equal(saleDoc.payment.amount, '0.00');
      equal(saleDoc.payment.received, '0.00');
    }
    if (doc.net_difference.startsWith('-')) {
      const refund = await ok(`/refunds/${doc.return_document.refund_id}`);
      equal(refund.amount, '2.00');
      equal(refund.status, 'CONFIRMED');
      equal(refund.method, method);
      equal(refund.reference, doc.reference);
    }
    equal(saleSnapshot(original.id), originalState);
  }
  const multi = await sale([
    [variant, '1'],
    [weightVariant, '1.125'],
  ]);
  let multiDoc = await ok('/exchanges', 'POST', {
    ...input(multi, [
      [variant2, '1'],
      [weightVariant, '1.125'],
    ]),
    items: multi.items.map((item) => ({
      original_sale_item_id: item.id,
      quantity: item.quantity,
      disposition: 'NO_STOCK_RETURN',
      destination_location_id: null,
    })),
  });
  equal(multiDoc.return_credit, '4.25');
  equal(multiDoc.replacement_total, '4.25');
  multiDoc = await action(
    await settle(await approved(multiDoc), 'NONE'),
    'complete',
  );
  equal(multiDoc.status, 'COMPLETED');
  equal(
    multiDoc.return_document.items.every((item) => item.movement_id === null),
    true,
    'no stock disposition never restocks',
  );
  const reversible = await sale([
    [variant, '1'],
    [variant2, '1'],
  ]);
  const reversalInput = input(reversible, [], '1');
  let reversal = await ok('/sales/voids', 'POST', reversalInput);
  await ok('/sales/voids', 'POST', reversalInput, undefined, 409);
  reversal = await settle(await approved(reversal), 'CASH_REFUND');
  const reversalKey = randomUUID(),
    requestRevision = reversal.revision;
  reversal = await action(reversal, 'complete', {}, reversalKey);
  equal(reversal.status, 'COMPLETED');
  equal(reversal.replacement_sale_id, null);
  equal(
    (await ok(`/refunds/${reversal.return_document.refund_id}`)).amount,
    '4.00',
  );
  equal(
    (
      await ok(
        `/sales/voids/${reversal.id}/complete`,
        'POST',
        { revision: requestRevision },
        reversalKey,
        200,
      )
    ).id,
    reversal.id,
  );
  await ok('/sales/voids', 'POST', input(positive, [], '2'), undefined, 409);
  const pending = await ok(
    '/exchanges',
    'POST',
    input(await sale([[variant, '1']])),
  );
  const rejected = await action(await action(pending, 'submit'), 'reject');
  equal(rejected.status, 'REJECTED');
  await action(rejected, 'complete', {}, undefined, 409);
  const cancelled = await action(
    await ok('/exchanges', 'POST', input(await sale([[variant, '1']]))),
    'cancel',
  );
  equal(cancelled.status, 'CANCELLED');
  await action(cancelled, 'submit', {}, undefined, 409);
  equal(
    authSQL(
      `SELECT count(*) FROM stock_balances balance WHERE organization_id='${org}' AND quantity<>(SELECT COALESCE(sum(quantity_delta),0) FROM stock_movements WHERE organization_id=balance.organization_id AND location_id=balance.location_id AND variant_id=balance.variant_id)`,
    ),
    '0',
    'ledger balances reconcile',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM sale_payments payment JOIN sales sale ON sale.organization_id=payment.organization_id AND sale.id=payment.sale_id WHERE sale.organization_id='${org}' AND sale.grand_total<>payment.amount+payment.credit_amount`,
    ),
    '0',
    'gross consideration reconciles credit + external',
  );
  console.log(
    `PASS: Phase 5.2 exchange/reversal flow ${assertions} assertions`,
  );
} finally {
  fixture.close();
}
