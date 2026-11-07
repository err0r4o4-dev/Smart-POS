export function assertIntegrationTestsRan(output) {
  const started = new Set(
    [...output.matchAll(/^=== RUN\s+(\S+)\s*$/gm)].map((match) => match[1]),
  );
  const completed = [...output.matchAll(/^\s*--- PASS:\s+(\S+)\s+\(/gm)]
    .map((match) => match[1])
    .some((name) => started.has(name) && (
      name === 'TestCustomerPaymentRateLimitScopesIsolatedDatabase' ||
      name.startsWith('TestSingleStoreIsolatedDatabase/')
    ));
  if (!completed) {
    throw new Error('No selected integration acceptance cases completed. Check SMARTPOS_SINGLE_STORE_TEST_PATTERN.');
  }
  if (/^\s*--- SKIP:/m.test(output)) {
    throw new Error('Selected integration acceptance cases were skipped.');
  }
}
