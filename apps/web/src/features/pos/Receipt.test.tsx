import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Receipt } from './SalesPages';
import type { POSSale } from '../../lib/pos-api';

const sale = {
  store_name: 'Snapshot Store',
  branch_name: 'Main',
  store_address: 'Saved address',
  sale_number: 'SAL-SNAPSHOT',
  cashier_name: 'Cashier',
  completed_at: '2026-10-09T12:00:00Z',
  grand_total: '2.25',
  currency: 'THB',
  receipt: { id: 'receipt', receipt_number: 'REC-SNAPSHOT' },
  items: [
    {
      variant_id: 'variant',
      stock_location_id: 'shelf',
      product_name: '<script>alert(1)</script>',
      variant_name: 'Weighted',
      sku: 'SKU-1',
      barcode: '001',
      unit: 'kg',
      quantity: '1.125',
      unit_price: '2.00',
      line_total: '2.25',
    },
  ],
  payment: {
    method: 'CASH',
    status: 'CONFIRMED',
    amount: '2.25',
    received: '10.00',
    change: '7.75',
    reference: '',
    confirmed_by: 'cashier',
    confirmed_at: '2026-10-09T12:00:00Z',
  },
} as POSSale;

describe('committed receipt snapshot', () => {
  it('renders saved items, exact totals and change without a catalog call', () => {
    render(<Receipt sale={sale} />);
    const receipt = screen.getByRole('article', { name: 'ใบเสร็จขาย' });
    expect(receipt).toHaveTextContent('Snapshot Store');
    expect(receipt).toHaveTextContent('REC-SNAPSHOT');
    expect(receipt).toHaveTextContent('1.125 kg × 2.00');
    expect(receipt).toHaveTextContent('2.25 THB');
    expect(receipt).toHaveTextContent('เงินรับ 10.00 · ทอน 7.75');
  });
  it('exposes the requested print width without creating a sale', () => {
    const { rerender } = render(<Receipt sale={sale} paper="58" />);
    expect(screen.getByRole('article')).toHaveClass('paper-58');
    rerender(<Receipt sale={sale} paper="80" />);
    expect(screen.getByRole('article')).toHaveClass('paper-80');
  });
  it('escapes untrusted catalog text', () => {
    const { container } = render(<Receipt sale={sale} />);
    expect(screen.getByText('<script>alert(1)</script>')).toBeVisible();
    expect(container.querySelector('script')).toBeNull();
  });
});
