import { act, fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { render } from '../../test/render';
import { ApiError } from '../../lib/api';
import { AvailabilitySettings } from './AvailabilitySettings';
import type { RestaurantAvailability } from './availability-api';

const requests = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn() }));
vi.mock('./availability-api', () => ({
  getRestaurantAvailability: requests.get,
  saveRestaurantAvailability: requests.save,
}));

it('does not restore removed tenant data when an old save finishes', async () => {
  const settings: RestaurantAvailability = {
    timezone: 'Asia/Bangkok',
    weekly_windows: [],
    global_pause: false,
    dine_in_paused: false,
    takeaway_paused: false,
    pickup_paused: false,
    delivery_paused: false,
    revision: 1,
  };
  const client = new QueryClient();
  let finish!: (value: RestaurantAvailability) => void;
  requests.get.mockResolvedValueOnce(settings);
  requests.save.mockClear().mockReturnValueOnce(
    new Promise<RestaurantAvailability>((resolve) => {
      finish = resolve;
    }),
  );
  const page = render(
    <QueryClientProvider client={client}>
      <AvailabilitySettings
        user="old-owner"
        organization="restaurant"
        csrf="csrf"
      />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('checkbox', { name: 'ทุกช่องทาง' }));
  fireEvent.click(screen.getByRole('button', { name: 'บันทึกเวลาและการพัก' }));
  await vi.waitFor(() => expect(requests.save).toHaveBeenCalledTimes(1));
  page.unmount();
  client.removeQueries({ queryKey: ['tenant'] });

  await act(async () => {
    finish({ ...settings, global_pause: true, revision: 2 });
    await vi.waitFor(() => expect(client.isMutating()).toBe(0));
  });
  expect(client.getQueriesData({ queryKey: ['tenant'] })).toEqual([]);
});

it('links to MFA in a new tab and keeps edits for an explicit retry', async () => {
  requests.save.mockClear();
  const settings = {
    timezone: 'Asia/Bangkok',
    weekly_windows: [],
    global_pause: false,
    dine_in_paused: false,
    takeaway_paused: false,
    pickup_paused: false,
    delivery_paused: false,
    revision: 1,
  };
  requests.get.mockResolvedValue(settings);
  requests.save
    .mockRejectedValueOnce(
      new ApiError(403, 'Denied', undefined, 'MFA_REQUIRED'),
    )
    .mockResolvedValueOnce({ ...settings, pickup_paused: true, revision: 2 });
  render(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>
        <AvailabilitySettings
          user="owner"
          organization="restaurant"
          csrf="csrf"
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
  const pickup = await screen.findByRole('checkbox', {
    name: 'สั่งล่วงหน้าแล้วมารับ',
  });
  fireEvent.click(pickup);
  const save = screen.getByRole('button', { name: 'บันทึกเวลาและการพัก' });
  fireEvent.click(save);
  const security = await screen.findByRole('link', {
    name: /ไปที่การยืนยันตัวตน 2 ขั้นตอน/,
  });
  expect(security).toHaveAttribute('href', '/security');
  expect(security).toHaveAttribute('target', '_blank');
  expect(pickup).toBeChecked();
  expect(requests.save).toHaveBeenCalledTimes(1);
  fireEvent.click(save);
  expect(await screen.findByRole('status')).toHaveTextContent(
    'บันทึกข้อมูลแล้ว',
  );
  expect(requests.save).toHaveBeenLastCalledWith(
    'restaurant',
    { ...settings, pickup_paused: true },
    'csrf',
  );
});

it('saves Pickup separately and reloads a stale edit only on request', async () => {
  const initial = {
    timezone: 'Asia/Bangkok',
    weekly_windows: [],
    global_pause: false,
    dine_in_paused: false,
    takeaway_paused: false,
    pickup_paused: false,
    delivery_paused: false,
    revision: 1,
  };
  requests.get.mockResolvedValue(initial);
  requests.save.mockRejectedValueOnce(new ApiError(409, 'Conflict'));
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AvailabilitySettings
        user="owner"
        organization="restaurant"
        csrf="csrf"
      />
    </QueryClientProvider>,
  );
  const pickup = await screen.findByRole('checkbox', {
    name: 'สั่งล่วงหน้าแล้วมารับ',
  });
  fireEvent.click(pickup);
  const save = screen.getByRole('button', { name: 'บันทึกเวลาและการพัก' });
  fireEvent.click(save);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'ค่าที่คุณแก้ยังอยู่',
  );
  expect(pickup).toBeChecked();
  expect(save).toBeDisabled();
  expect(requests.save).toHaveBeenCalledWith(
    'restaurant',
    { ...initial, pickup_paused: true },
    'csrf',
  );
  requests.get.mockResolvedValue({
    ...initial,
    revision: 2,
    global_pause: true,
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'ทิ้งค่าที่แก้และโหลดค่าล่าสุด' }),
  );
  const global = screen.getByRole('checkbox', { name: 'ทุกช่องทาง' });
  await vi.waitFor(() => expect(global).toBeChecked());
  expect(pickup).not.toBeChecked();
  fireEvent.click(pickup);
  requests.save.mockResolvedValue({
    ...initial,
    revision: 3,
    global_pause: true,
    pickup_paused: true,
  });
  fireEvent.click(save);
  expect(await screen.findByRole('status')).toHaveTextContent(
    'บันทึกข้อมูลแล้ว',
  );
  expect(requests.save).toHaveBeenLastCalledWith(
    'restaurant',
    { ...initial, revision: 2, global_pause: true, pickup_paused: true },
    'csrf',
  );
});
