import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  initMockApi,
  isMockEnabled,
  MOCK_STORAGE_KEY,
  setMockEnabled,
} from './mock-service';

describe('mock-service', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('detects mock disabled by default', () => {
    expect(isMockEnabled()).toBe(false);
  });

  it('detects mock enabled via query parameter', () => {
    window.history.replaceState({}, '', '/?mock=true');
    expect(isMockEnabled()).toBe(true);
    expect(localStorage.getItem(MOCK_STORAGE_KEY)).toBe('true');
  });

  it('detects mock enabled via localStorage', () => {
    localStorage.setItem(MOCK_STORAGE_KEY, 'true');
    expect(isMockEnabled()).toBe(true);
  });

  it('allows disabling mock via query param ?mock=false', () => {
    localStorage.setItem(MOCK_STORAGE_KEY, 'true');
    window.history.replaceState({}, '', '/?mock=false');
    expect(isMockEnabled()).toBe(false);
    expect(localStorage.getItem(MOCK_STORAGE_KEY)).toBeNull();
  });

  it('toggles mock state with setMockEnabled', () => {
    setMockEnabled(true, false);
    expect(localStorage.getItem(MOCK_STORAGE_KEY)).toBe('true');
    setMockEnabled(false, false);
    expect(localStorage.getItem(MOCK_STORAGE_KEY)).toBeNull();
  });

  it('intercepts fetch when mock is initialized', async () => {
    localStorage.setItem(MOCK_STORAGE_KEY, 'true');
    initMockApi();

    const res = await window.fetch('/health/ready');
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ status: 'ready' });
  });
});