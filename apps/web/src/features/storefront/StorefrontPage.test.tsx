import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it } from 'vitest';
import { StorefrontLayout } from '../../layouts/StorefrontLayout';
import { StorefrontPage } from './StorefrontPage';

it('keeps the customer area independent of auth and organization providers', () => {
  render(
    <MemoryRouter initialEntries={['/shop']}>
      <Routes>
        <Route path="/shop" element={<StorefrontLayout />}>
          <Route index element={<StorefrontPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('heading', { level: 1, name: 'หน้าร้านออนไลน์' }),
  ).toBeVisible();
  expect(screen.getByText('สำหรับลูกค้า')).toBeVisible();
  expect(
    screen.getByRole('navigation', { name: 'เมนูหน้าร้านลูกค้า' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('navigation', { name: 'Main navigation' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  for (const path of [
    '/pos',
    '/employees',
    '/inventory',
    '/settings/store',
    '/register',
  ])
    expect(document.querySelector(`a[href="${path}"]`)).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'ยังไม่เปิดรับคำสั่งซื้อ' }),
  ).toBeDisabled();
  expect(document.querySelector('main main')).not.toBeInTheDocument();
});
