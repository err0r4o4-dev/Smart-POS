import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertIntegrationTestsRan } from './single-store-test-output.mjs';

test('rejects a selection that runs no integration tests', () => {
  assert.throws(
    () => assertIntegrationTestsRan('testing: warning: no tests to run\nPASS\nok package [no tests to run]'),
    /No selected integration acceptance cases completed/,
  );
});

test('rejects a matching parent with no selected subtests', () => {
  assert.throws(
    () => assertIntegrationTestsRan('=== RUN   TestSingleStoreIsolatedDatabase\n--- PASS: TestSingleStoreIsolatedDatabase (0.01s)\nPASS'),
    /No selected integration acceptance cases completed/,
  );
});

test('accepts a completed selected database case', () => {
  assert.doesNotThrow(() => assertIntegrationTestsRan(
    '=== RUN   TestSingleStoreIsolatedDatabase\n=== RUN   TestSingleStoreIsolatedDatabase/menu-only_zero-stock_sales\n--- PASS: TestSingleStoreIsolatedDatabase (1.00s)\n    --- PASS: TestSingleStoreIsolatedDatabase/menu-only_zero-stock_sales (0.90s)\nPASS',
  ));
});

test('accepts the standalone rate-limit database case', () => {
  assert.doesNotThrow(() => assertIntegrationTestsRan(
    '=== RUN   TestCustomerPaymentRateLimitScopesIsolatedDatabase\n--- PASS: TestCustomerPaymentRateLimitScopesIsolatedDatabase (0.01s)\nPASS',
  ));
});

test('rejects skipped selected cases even if another selected case passed', () => {
  assert.throws(
    () => assertIntegrationTestsRan('=== RUN   TestCustomerPaymentRateLimitScopesIsolatedDatabase\n--- PASS: TestCustomerPaymentRateLimitScopesIsolatedDatabase (0.01s)\n=== RUN   TestSingleStoreIsolatedDatabase\n--- SKIP: TestSingleStoreIsolatedDatabase (0.00s)\nPASS'),
    /Selected integration acceptance cases were skipped/,
  );
});

test('does not mistake unrelated tests or pass text for database acceptance', () => {
  assert.throws(
    () => assertIntegrationTestsRan('=== RUN   TestUnrelated\n--- PASS: TestUnrelated (0.01s)\nPASS'),
    /No selected integration acceptance cases completed/,
  );
});
