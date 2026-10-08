import { config } from '../app/config';

export async function getReadiness(
  signal?: AbortSignal,
): Promise<{ status: 'ready' }> {
  const response = await fetch(config.readinessPath, {
    signal,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok)
    throw new Error(
      'The API or its database is unavailable. Start the local stack, then retry.',
    );
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('status' in body) ||
    body.status !== 'ready'
  )
    throw new Error('The API returned an unexpected readiness response.');
  return { status: 'ready' };
}
