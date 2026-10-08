import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import { POSLayout } from './POSLayout';
import { AuthLayout } from './AuthLayout';

it('never enables a fake login', () => {
  render(
    <MemoryRouter>
      <AuthLayout />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('button', { name: 'Sign in unavailable' }),
  ).toBeDisabled();
  expect(screen.getByLabelText('Email address')).toBeDisabled();
});
it('never enables a fake checkout', () => {
  render(
    <MemoryRouter>
      <POSLayout />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('button', { name: 'Checkout unavailable' }),
  ).toBeDisabled();
  expect(screen.getByRole('status')).toHaveTextContent('presentation only');
});
