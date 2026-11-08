import { screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { renderInEnglish as render } from '../test/render';
import { LoginLayout } from './LoginLayout';

it('provides one full-page brand header with the back link below it', () => {
  render(
    <MemoryRouter>
      <LoginLayout>
        <h2 id="login-title">Welcome back.</h2>
      </LoginLayout>
    </MemoryRouter>,
  );
  const header = screen.getByRole('banner');
  expect(within(header).getByRole('img', { name: 'VELO Icon' })).toBeVisible();
  expect(within(header).getByRole('group', { name: 'Language' })).toBeVisible();
  expect(
    within(header).queryByRole('link', { name: 'Back to home' }),
  ).toBeNull();
  const back = screen.getByRole('link', { name: 'Back to home' });
  expect(back).toHaveAttribute('href', '/');
  expect(
    header.compareDocumentPosition(back) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.getAllByRole('img', { name: 'VELO Icon' })).toHaveLength(1);
  expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
});
