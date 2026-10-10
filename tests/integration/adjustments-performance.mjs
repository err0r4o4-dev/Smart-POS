import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { adjustmentsFixture } from './adjustments-fixtures.mjs';

const fixture = await adjustmentsFixture(),
  samples = [];
async function measured(path, method = 'GET', body, status = 200) {
  const started = performance.now();
  const result = await fixture.call(path, method, body);
  assert.equal(
    result.status,
    status,
    path + ': ' + JSON.stringify(result.error),
  );
  samples.push({
    path: path.replace(/[a-f0-9]{8}-[a-f0-9-]{27}/g, '{id}'),
    ms: Math.round((performance.now() - started) * 100) / 100,
  });
  return result.data;
}
try {
  for (let iteration = 0; iteration < 3; iteration++) {
    const original = await fixture.sale([[fixture.variant, '1']]);
    await measured(`/returns/sales/${original.id}`);
    const input = fixture.input(original, [[fixture.variant2, '2']]);
    await measured('/exchanges/quote', 'POST', input);
    let doc = await measured('/exchanges', 'POST', input, 201);
    for (const action of ['submit', 'approve'])
      doc = await measured(`/exchanges/${doc.id}/${action}`, 'POST', {
        revision: doc.revision,
      });
    doc = await measured(`/exchanges/${doc.id}/confirm-settlement`, 'POST', {
      revision: doc.revision,
      method: 'CASH',
      shift_id: fixture.shift.id,
      note: 'Performance synthetic acknowledgement',
      acknowledged: true,
    });
    doc = await measured(`/exchanges/${doc.id}/complete`, 'POST', {
      revision: doc.revision,
    });
    assert.equal(doc.status, 'COMPLETED');
  }
  console.log(
    'PASS: representative Phase5.2 local HTTP latency (not production load): ' +
      JSON.stringify(samples),
  );
} finally {
  fixture.close();
}
