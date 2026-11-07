import { render } from '../../test/render';
import { fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { POSTerminalPage } from './POSTerminalPage';

const mocks = vi.hoisted(() => ({ request: vi.fn(), mutate: vi.fn(), setMessage: vi.fn(), refresh: vi.fn(), policy: 'MENU_ONLY' as string | undefined, items: [] as unknown[] }));
vi.mock('./POSContext', () => ({ usePOS: () => ({ user: 'u', org: 'o', branch: 'b', terminal: { id: 't' }, shift: { id: 's' }, busy: false, cart: { id: 'c', revision: 1, stock_policy: mocks.policy, items: mocks.items, total: '0.00' }, mutate: mocks.mutate, setMessage: mocks.setMessage, refresh: mocks.refresh }) }));
vi.mock('../../lib/pos-api', async (original) => ({ ...(await original<typeof import('../../lib/pos-api')>()), posRequest: mocks.request }));
vi.mock('../customers/CustomerPicker', () => ({ CustomerPicker: () => null }));
vi.mock('../quality/BatchPicker', () => ({ CartBatchPicker: () => <span>Batch picker</span> }));
const item = { variant_id: 'v', product_name: 'Dish', variant_name: 'Regular', sku: 'DISH', unit: 'plate', unit_type: 'COUNT', unit_price: '50.00', quantity: '1', line_total: '50.00', available: null, stock_policy: 'MENU_ONLY', saleable: true, product_status: 'ACTIVE', variant_status: 'ACTIVE', unit_status: 'ACTIVE' };
beforeEach(() => { mocks.items = []; mocks.policy = 'MENU_ONLY'; mocks.refresh.mockReset(); mocks.mutate.mockReset(); mocks.setMessage.mockReset(); mocks.request.mockImplementation(async (_org, path: string) => ({ items: path.startsWith('/pos/products') ? [item, { ...item, variant_id: 't', sku: 'TRACK', stock_policy: 'TRACKED' }] : [], total: 2 })); });
function setup() { return render(<QueryClientProvider client={new QueryClient({defaultOptions: {queries: {retry: false}}})}><MemoryRouter><POSTerminalPage /></MemoryRouter></QueryClientProvider>); }
it('allows menu-only items without stock, while tracked null stock stays disabled', async () => {
  setup();
  const add = await screen.findByRole('button', {name: 'เพิ่ม DISH'});
  expect(add).toBeEnabled();
  expect(screen.getByRole('button', {name: 'เพิ่ม TRACK'})).toBeDisabled();
  fireEvent.click(add);
  expect(mocks.mutate).toHaveBeenCalledWith('/pos/carts/c', expect.objectContaining({items: [expect.objectContaining({variant_id: 'v', quantity: '1'})]}), 'PATCH');
});
it('hides batch and stock shortage for menu-only cart lines while enforcing quantity limit', () => {
  mocks.items = [item];
  setup();
  expect(screen.queryByText('Batch picker')).not.toBeInTheDocument();
  expect(screen.queryByText(/สต็อกไม่พอ/)).not.toBeInTheDocument();
  const input = screen.getByRole('textbox', {name: /DISH/});
  fireEvent.change(input, {target: {value: '1000001'}});
  fireEvent.blur(input);
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(mocks.setMessage).toHaveBeenCalled();
});
it('disables positive stock for an unknown or missing policy', async () => {
  mocks.request.mockImplementation(async (_org, path: string) => ({ items: path.startsWith('/pos/products') ? [{ ...item, sku: 'UNKNOWN', stock_policy: 'FUTURE', available: '20.000' }, { ...item, variant_id: 'missing', sku: 'MISSING', stock_policy: undefined, available: '20.000' }] : [], total: 2 }));
  setup();
  expect(await screen.findByRole('button', {name: 'เพิ่ม UNKNOWN'})).toBeDisabled();
  expect(screen.getByRole('button', {name: 'เพิ่ม MISSING'})).toBeDisabled();
});

it.each([[undefined, 'MENU_ONLY'], ['UNKNOWN', 'MENU_ONLY'], ['MENU_ONLY', undefined], ['MENU_ONLY', 'UNKNOWN'], ['TRACKED', 'MENU_ONLY']])('blocks edits and checkout when cart policy %s and item policy %s conflict', (policy, itemPolicy) => {
  mocks.policy = policy;
  mocks.items = [{ ...item, stock_policy: itemPolicy }];
  setup();
  expect(screen.getByRole('button', { name: 'ไปชำระเงิน' })).toBeDisabled();
  expect(screen.getByRole('button', { name: /เพิ่มจำนวน.*DISH/ })).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent(/โหลดตะกร้าใหม่/);
  fireEvent.click(screen.getByRole('button', { name: 'โหลดตะกร้าใหม่' }));
  expect(mocks.refresh).toHaveBeenCalled();
  expect(mocks.mutate).not.toHaveBeenCalled();
});

it.each([['2.000', '3'], [null, '1']])('rejects tracked quantity exceeding availability %s', (available, quantity) => {
  mocks.policy = 'TRACKED';
  mocks.items = [{ ...item, stock_policy: 'TRACKED', available, quantity: '1' }];
  setup();
  const input = screen.getByRole('textbox', {name: /DISH/});
  fireEvent.change(input, {target: {value: quantity}});
  fireEvent.blur(input);
  expect(mocks.mutate).not.toHaveBeenCalled();
});

it.each([['COUNT', '0.5', false], ['WEIGHT', '0.5', true], ['COUNT', '1000000', true], ['COUNT', '1000001', false]])('checks menu-only %s quantity %s', (unitType, quantity, allowed) => {
  mocks.items = [{ ...item, unit_type: unitType }];
  setup();
  const input = screen.getByRole('textbox', {name: /DISH/});
  fireEvent.change(input, {target: {value: quantity}});
  fireEvent.blur(input);
  expect(mocks.mutate).toHaveBeenCalledTimes(allowed ? 1 : 0);
});
