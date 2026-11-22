import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderInEnglish } from '../../test/render';
import { MFARequiredState } from './MFARequiredState';

it('offers account security outside organization access', () => {
  renderInEnglish(
    <MemoryRouter>
      <MFARequiredState />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('heading', {
      level: 1,
      name: 'MFA verification required',
    }),
  ).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Verify MFA for this session',
  );
  expect(
    screen.getByRole('link', { name: 'Account security' }),
  ).toHaveAttribute('href', '/security');
});
