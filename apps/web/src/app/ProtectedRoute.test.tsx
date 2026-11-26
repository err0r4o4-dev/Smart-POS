import { render } from '../test/render';
import { screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute';
import { anonymousSession } from './access';

it('redirects an anonymous visitor away from a protected route', () => {
  render(
    <MemoryRouter initialEntries={['/protected']}>
      <Routes>
        <Route
          element={
            <ProtectedRoute
              session={anonymousSession}
              permission="catalog.read"
            />
          }
        >
          <Route path="/protected" element={<h1>Private catalog</h1>} />
        </Route>
        <Route path="/403" element={<h1>Access denied</h1>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { name: 'Access denied' })).toBeVisible();
  expect(screen.queryByText('Private catalog')).not.toBeInTheDocument();
});
