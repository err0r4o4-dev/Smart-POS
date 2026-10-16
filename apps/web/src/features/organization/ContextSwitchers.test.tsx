import { render } from '../../test/render';
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { ContextSwitchers } from './OrganizationGate';

const mocks = vi.hoisted(() => ({
  mode: 'single' as 'single' | 'multi',
  select: vi.fn(),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    storeMode: mocks.mode,
    loading: false,
    branchID: 'main',
    select: mocks.select,
    organizations: [{ id: 'store', name: 'ร้านทดสอบ' }],
    context: {
      organization: { id: 'store' },
      branches: [
        { id: 'main', name: 'สาขาหลัก' },
        { id: 'other', name: 'อีกสาขา' },
      ],
    },
  }),
}));
beforeEach(() => {
  mocks.mode = 'single';
  mocks.select.mockReset();
});

it('hides organization switching while preserving authorized branch selection', () => {
  render(<ContextSwitchers />);
  expect(
    screen.queryByRole('combobox', { name: 'องค์กรที่ใช้งาน' }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'สาขาที่ใช้งาน' }), {
    target: { value: 'other' },
  });
  expect(mocks.select).toHaveBeenCalledWith('store', 'other');
});
it('preserves the organization switcher in compatibility mode', () => {
  mocks.mode = 'multi';
  render(<ContextSwitchers />);
  expect(
    screen.getByRole('combobox', { name: 'องค์กรที่ใช้งาน' }),
  ).toBeVisible();
});
