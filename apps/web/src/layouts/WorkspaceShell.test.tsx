import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import type { WorkspaceArea } from '../app/access';
import { renderInEnglish as render } from '../test/render';
import { WorkspaceShell } from './ManagementLayout';

vi.mock('../app/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'anonymous' } }),
}));
vi.mock('../app/OrganizationProvider', () => ({
  useOrganization: () => ({ context: null, loading: false, error: null }),
}));

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.close = vi.fn();
});

function renderShell(area: WorkspaceArea) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<WorkspaceShell area={area} />}>
          <Route index element={<h1>Workspace content</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

it('omits the footer from the account shell without removing page content', () => {
  renderShell('account');

  expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Workspace content' }),
  ).toBeVisible();
  expect(screen.getByRole('banner')).toBeVisible();
});

it('preserves the footer in the management shell', () => {
  renderShell('management');

  expect(screen.getByRole('contentinfo')).toHaveTextContent(
    'The customer storefront is separate from the team workspace',
  );
});
