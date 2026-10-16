import { render } from '../../test/render';
import { screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { PageError } from './PageError';

afterEach(() => vi.restoreAllMocks());
function BrokenPage(): never {
  throw new Error('Internal diagnostic details');
}

it('offers recovery without claiming a failed render rolled back a transaction', () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  render(
    <ErrorBoundary>
      <BrokenPage />
    </ErrorBoundary>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'ตรวจสอบสถานะรายการก่อนทำซ้ำ',
  );
  expect(
    screen.queryByText(
      /No transaction was submitted|Internal diagnostic details/,
    ),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'โหลดหน้าอีกครั้ง' }),
  ).toBeEnabled();
});

it('handles a route render failure with the same actionable fallback', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const router = createMemoryRouter([
    {
      errorElement: <PageError />,
      children: [{ path: '/', element: <BrokenPage /> }],
    },
  ]);
  render(<RouterProvider router={router} />);
  expect(
    await screen.findByRole('heading', { name: 'ไม่สามารถแสดงหน้านี้ได้' }),
  ).toBeVisible();
  expect(
    screen.queryByText('Internal diagnostic details'),
  ).not.toBeInTheDocument();
});
