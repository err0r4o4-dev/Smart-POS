import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it } from 'vitest';
import { WorkspaceLink } from './WorkspaceNavigation';
import { useWorkspaceNavigate } from './useWorkspaceNavigate';

function Harness() {
  const navigate = useWorkspaceNavigate();
  const location = useLocation();
  return (
    <>
      <WorkspaceLink to="/menu">Menu list</WorkspaceLink>
      <WorkspaceLink to="/menu/item?search=abc#details">
        Menu item
      </WorkspaceLink>
      <WorkspaceLink
        to={{
          pathname: '/orders',
          search: '?status=PENDING',
          hash: '#list',
        }}
      >
        Orders
      </WorkspaceLink>
      <WorkspaceLink to="/dashboard">Overview</WorkspaceLink>
      <button onClick={() => void navigate('/menu/item/edit?mode=1#form')}>
        Edit
      </button>
      <button
        onClick={() =>
          void navigate({
            pathname: '/menu/item',
            search: '?saved=1',
            hash: '#details',
          })
        }
      >
        Save destination
      </button>
      <button onClick={() => void navigate(-1)}>Back</button>
      <output aria-label="Location">
        {location.pathname + location.search + location.hash}
      </output>
    </>
  );
}

it('navigates directly using clean root paths and marks exact active link', () => {
  render(
    <MemoryRouter initialEntries={['/menu']}>
      <Harness />
    </MemoryRouter>,
  );
  expect(screen.getByRole('link', { name: 'Menu list' })).toHaveAttribute(
    'data-active',
    'true',
  );
  expect(screen.getByRole('link', { name: 'Menu item' })).toHaveAttribute(
    'href',
    '/menu/item?search=abc#details',
  );
  expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute(
    'href',
    '/orders?status=PENDING#list',
  );
  expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
    'href',
    '/dashboard',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent(
    '/menu/item/edit?mode=1#form',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save destination' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent(
    '/menu/item?saved=1#details',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByLabelText('Location')).toHaveTextContent(
    '/menu/item/edit?mode=1#form',
  );
});
