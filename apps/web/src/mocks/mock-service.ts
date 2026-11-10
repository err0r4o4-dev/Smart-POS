import { handleMockRequest, resetMockState } from './mock-engine';

export const MOCK_STORAGE_KEY = 'smartpos_mock';

export function isMockEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('mock')) {
      const val = params.get('mock');
      if (val === '' || val === 'true' || val === '1') {
        localStorage.setItem(MOCK_STORAGE_KEY, 'true');
        return true;
      }
      if (val === 'false' || val === '0') {
        localStorage.removeItem(MOCK_STORAGE_KEY);
        return false;
      }
    }
    if (localStorage.getItem(MOCK_STORAGE_KEY) === 'true') {
      return true;
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
  return import.meta.env.VITE_MOCK === 'true';
}

export function setMockEnabled(enabled: boolean, reload = true): void {
  if (typeof window === 'undefined') return;
  try {
    if (enabled) {
      localStorage.setItem(MOCK_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(MOCK_STORAGE_KEY);
    }
    if (reload) {
      window.location.reload();
    }
  } catch {
    // Ignore storage errors
  }
}

let mockInitialized = false;

export function initMockApi(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isMockEnabled()) return false;
  if (mockInitialized) return true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const urlStr =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (
      urlStr.startsWith('/') ||
      urlStr.includes(window.location.host) ||
      urlStr.includes('/api/v1') ||
      urlStr.includes('/health')
    ) {
      let body: unknown = undefined;
      if (init?.body && typeof init.body === 'string') {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }

      const method = (init?.method ?? 'GET').toUpperCase();
      const mockRes = handleMockRequest(urlStr, method, body);

      if (mockRes) {
        // Small simulated latency for smooth UI rendering
        await new Promise((resolve) => setTimeout(resolve, 20));

        const headers = new Headers({
          'Content-Type': 'application/json',
          ...(mockRes.headers ?? {}),
        });

        return new Response(JSON.stringify(mockRes.body), {
          status: mockRes.status,
          headers,
        });
      }
    }

    return originalFetch(input, init);
  };

  mockInitialized = true;
  return true;
}

export { resetMockState };