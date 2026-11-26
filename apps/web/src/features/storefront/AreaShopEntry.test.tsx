import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderInEnglish } from '../../test/render';
import { AreaShopEntry } from './AreaShopEntry';

const auth = vi.hoisted(() => ({ userID: '' }));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: auth.userID
      ? { status: 'authenticated', session: { user: { id: auth.userID } } }
      : { status: 'anonymous', session: null },
  }),
}));

const request = vi.fn();
const locate = vi.fn();

beforeEach(() => {
  auth.userID = '';
  request.mockReset();
  locate.mockReset();
  vi.stubGlobal('fetch', request);
  vi.stubGlobal(
    'navigator',
    Object.create(navigator, {
      geolocation: { value: { getCurrentPosition: locate } },
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

function renderArea() {
  renderInEnglish(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/shop?view=area']}>
        <AreaShopEntry />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function response(data: unknown) {
  return Response.json({ data });
}

it('shows the signed-in owner’s restaurants without requesting a location', async () => {
  auth.userID = 'merchant';
  request.mockResolvedValue(response([{ id: 'own', name: 'My restaurant' }]));
  renderArea();
  expect(
    await screen.findByRole('heading', { name: 'My restaurant' }),
  ).toBeVisible();
  expect(request).toHaveBeenCalledExactlyOnceWith(
    '/api/v1/organizations',
    expect.objectContaining({ credentials: 'same-origin' }),
  );
  expect(locate).not.toHaveBeenCalled();
});

it('loads nearby published stores for guests using coordinates in the body', async () => {
  locate.mockImplementation((success) =>
    success({ coords: { latitude: 13.75, longitude: 100.5 } }),
  );
  request.mockResolvedValue(
    response([
      { slug: 'nearby-cafe', name: 'Nearby cafe', accepting_orders: true },
    ]),
  );
  renderArea();
  expect(
    await screen.findByRole('heading', { name: 'Nearby cafe' }),
  ).toBeVisible();
  expect(request).toHaveBeenCalledExactlyOnceWith(
    '/api/v1/storefronts/discovery/nearby',
    expect.objectContaining({
      credentials: 'omit',
      method: 'POST',
      body: '{"latitude":13.75,"longitude":100.5}',
    }),
  );
});

it('keeps the full directory reachable for a signed-in account without a store that denies location', async () => {
  auth.userID = 'buyer';
  request.mockResolvedValue(response([]));
  locate.mockImplementation((_success, failure) => failure({ code: 1 }));
  renderArea();
  expect(await screen.findByText(/Your location is unavailable/)).toBeVisible();
  expect(screen.getByRole('link', { name: 'All stores' })).toHaveAttribute(
    'href',
    '/shop',
  );
  expect(request).toHaveBeenCalledTimes(1);
});
