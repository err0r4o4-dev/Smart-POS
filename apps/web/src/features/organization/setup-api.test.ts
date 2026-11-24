import { beforeEach, describe, expect, it, vi } from 'vitest';
import { organizationRequest } from '../../lib/organization-api';
import { completeSetup, getSetup, saveSetupStep } from './setup-api';

vi.mock('../../lib/organization-api', () => ({
  organizationRequest: vi.fn(),
}));

const response = {
  organization_id: 'restaurant-id',
  current_step: 'profile',
  completed: false,
  readiness: { ready: false, incomplete: [] },
  steps: [],
  services: { dine_in: false, takeaway: true, delivery: false },
};
const context = { organizationID: 'restaurant-id', branchID: '' };

describe('organization-scoped setup client', () => {
  beforeEach(() => {
    vi.mocked(organizationRequest).mockReset().mockResolvedValue(response);
  });

  it('reads restaurant setup without a branch selector and preserves cancellation', async () => {
    const controller = new AbortController();
    await getSetup(context, controller.signal);
    expect(organizationRequest).toHaveBeenCalledWith(
      '/organizations/restaurant-id/restaurant/setup',
      { signal: controller.signal },
    );
  });

  it('sends no branch field when saving organization-scoped configuration', async () => {
    await saveSetupStep(
      'services',
      { service_modes: response.services },
      context,
      'csrf',
      'command-key',
    );
    expect(organizationRequest).toHaveBeenCalledWith(
      '/organizations/restaurant-id/restaurant/setup/services',
      {
        method: 'PUT',
        body: { service_modes: response.services },
        csrf: 'csrf',
        key: 'command-key',
      },
    );
  });

  it('saves exact menu prices without inserting a branch or stock source', async () => {
    const menu = {
      categories: [{ name: 'Meals' }],
      items: [{ category: 'Meals', name: 'Soup', price: '55.35' }],
    };
    await saveSetupStep('menu', menu, context, 'csrf', 'menu-key');
    expect(organizationRequest).toHaveBeenCalledWith(
      '/organizations/restaurant-id/restaurant/setup/menu',
      { method: 'PUT', body: menu, csrf: 'csrf', key: 'menu-key' },
    );
  });

  it.each(['', 'legacy-branch'])(
    'uses the correct QR flags for branch selector %j',
    async (branchID) => {
      const zones = [{ code: 'MAIN', name: 'Main room' }];
      await saveSetupStep(
        'tables',
        {
          zones,
          tables: [{ code: 'T1', name: 'Renamed', zone: 'Main room', seats: 4 }],
          qr_enabled: true,
        },
        { ...context, branchID },
        'csrf',
        'table-key',
      );
      expect(organizationRequest).toHaveBeenCalledWith(
        '/organizations/restaurant-id/restaurant/setup/tables',
        {
          method: 'PUT',
          body: {
            zones,
            tables: [{ code: 'T1', name: 'Renamed', zone_code: 'MAIN', seats: 4 }],
            ...(branchID
              ? { branch_id: branchID, generate_qr: true }
              : { qr_enabled: true }),
          },
          csrf: 'csrf',
          key: 'table-key',
        },
      );
    },
  );

  it.each([true, false])(
    'preserves explicit Pickup=%s independently of Takeaway',
    async (pickup) => {
      const modes = {
        dine_in: false,
        takeaway: false,
        delivery: false,
        pickup,
      };
      vi.mocked(organizationRequest).mockResolvedValueOnce({
        ...response,
        services: modes,
      });
      const state = await saveSetupStep(
        'services',
        { service_modes: modes },
        context,
        'csrf',
        'pickup-key',
      );
      expect(state.services?.service_modes).toEqual(modes);
      expect(organizationRequest).toHaveBeenCalledWith(
        '/organizations/restaurant-id/restaurant/setup/services',
        {
          method: 'PUT',
          body: { service_modes: modes },
          csrf: 'csrf',
          key: 'pickup-key',
        },
      );
    },
  );

  it('keeps Pickup absent in historical responses and legacy request payloads', async () => {
    const state = await getSetup(context);
    expect(state.services?.service_modes).not.toHaveProperty('pickup');
    await saveSetupStep(
      'services',
      { service_modes: response.services },
      { ...context, branchID: 'legacy-branch' },
      'csrf',
      'legacy-key',
    );
    expect(organizationRequest).toHaveBeenLastCalledWith(
      '/organizations/restaurant-id/restaurant/setup/services',
      {
        method: 'PUT',
        body: {
          branch_id: 'legacy-branch',
          service_modes: { dine_in: false, takeaway: true, delivery: false },
        },
        csrf: 'csrf',
        key: 'legacy-key',
      },
    );
  });

  it('completes without a branch while preserving the completion gate', async () => {
    expect(await completeSetup(context, 'csrf', 'complete-key')).toEqual({
      ready: false,
      dashboard: '/dashboard',
    });
    expect(organizationRequest).toHaveBeenCalledWith(
      '/organizations/restaurant-id/restaurant/setup/complete',
      { method: 'POST', body: {}, csrf: 'csrf', key: 'complete-key' },
    );
  });

  it('retains an explicitly selected branch only for the legacy flow', async () => {
    await getSetup({ ...context, branchID: 'legacy-branch' });
    expect(organizationRequest).toHaveBeenCalledWith(
      '/organizations/restaurant-id/restaurant/setup?branch_id=legacy-branch',
      { signal: undefined },
    );
  });

  it('propagates server failures without claiming setup is complete', async () => {
    vi.mocked(organizationRequest).mockRejectedValueOnce(new Error('offline'));
    await expect(
      completeSetup(context, 'csrf', 'complete-key'),
    ).rejects.toThrow('offline');
  });
});
