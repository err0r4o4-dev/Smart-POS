import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderInEnglish } from '../../test/render';
import { MFARequiredState } from './MFARequiredState';

it('offers account security in a new tab without navigating away from a draft', () => {
  renderInEnglish(
    <MemoryRouter>
      <MFARequiredState newTab />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('heading', {
      level: 3,
      name: 'MFA verification required',
    }),
  ).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Verify MFA for this session',
  );
  const link = screen.getByRole('link', {
    name: 'Open account security (new tab)',
  });
  expect(link).toHaveAttribute('href', '/security');
  expect(link).toHaveAttribute('target', '_blank');
});
