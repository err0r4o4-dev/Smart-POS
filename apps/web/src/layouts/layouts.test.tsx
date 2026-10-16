import { renderInEnglish as render } from '../test/render';
import { screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import { HelpPage } from '../features/help/HelpPage';
import { AuthLayout } from './AuthLayout';

it('renders supplied authentication controls without a preview fallback', () => {
  render(
    <MemoryRouter>
      <AuthLayout>
        <form aria-label="Sign in">
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" />
          <button type="submit">Sign in</button>
        </form>
      </AuthLayout>
    </MemoryRouter>,
  );
  expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
  expect(screen.getByLabelText('Email address')).toBeEnabled();
  expect(screen.queryByText(/preview/i)).not.toBeInTheDocument();
});
it('shows operational help without links to removed previews', () => {
  render(
    <MemoryRouter>
      <HelpPage />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('heading', { name: 'Know the boundary' }),
  ).toBeVisible();
  expect(screen.getByText(/Checkout requires POS access/)).toBeVisible();
  expect(document.querySelectorAll('a[href^="/preview/"]')).toHaveLength(0);
  expect(screen.queryByText(/preview/i)).not.toBeInTheDocument();
});
