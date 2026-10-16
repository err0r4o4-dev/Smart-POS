import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from './language';
import { LoginPage, RegisterPage } from '../features/auth/AuthPages';

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({ signIn: vi.fn(), state: { status: 'anonymous' } }),
}));
beforeEach(() => localStorage.clear());

it('switches the actual auth page without losing form state, then retains language on navigation', () => {
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
  fireEvent.change(screen.getByLabelText('ที่อยู่อีเมล'), {
    target: { value: 'synthetic@example.test' },
  });
  fireEvent.change(screen.getByLabelText('รหัสผ่าน'), {
    target: { value: 'draft-password' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  expect(screen.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
  expect(screen.getByLabelText('Email address')).toHaveValue(
    'synthetic@example.test',
  );
  expect(screen.getByLabelText('Password')).toHaveValue('draft-password');
  fireEvent.click(screen.getByRole('link', { name: 'Create account' }));
  expect(screen.getByRole('heading', { name: 'Get started.' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

it('updates a validation message already shown when changing language', () => {
  render(
    <LanguageProvider>
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    </LanguageProvider>,
  );
  fireEvent.change(screen.getByLabelText('รหัสผ่าน'), {
    target: { value: 'draft-password' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'สร้างบัญชี' }).closest('form')!,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('รหัสผ่านไม่ตรงกัน');
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Passwords do not match');
});
