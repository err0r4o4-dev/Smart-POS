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
      <WorkspaceLink to="/products/item?search=abc#details">
        Product
      </WorkspaceLink>
      <WorkspaceLink
        to={{
          pathname: '/inventory/balances',
          search: '?branch=1',
          hash: '#table',
        }}
      >
        Stock
      </WorkspaceLink>
      <WorkspaceLink to="/manage/dashboard">Switch area</WorkspaceLink>
      <button onClick={() => void navigate('/products/item/edit?mode=1#form')}>
        Edit
      </button>
      <button
        onClick={() =>
          void navigate({
            pathname: '/products/item',
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

it.each(['/work', '/manage'])(
  'keeps links and programmatic navigation within %s',
  (prefix) => {
    render(
      <MemoryRouter initialEntries={[prefix + '/products']}>
        <Harness />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Product' })).toHaveAttribute(
      'href',
      prefix + '/products/item?search=abc#details',
    );
    expect(screen.getByRole('link', { name: 'Stock' })).toHaveAttribute(
      'href',
      prefix + '/inventory/balances?branch=1#table',
    );
    expect(screen.getByRole('link', { name: 'Switch area' })).toHaveAttribute(
      'href',
      '/manage/dashboard',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Location')).toHaveTextContent(
      prefix + '/products/item/edit?mode=1#form',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save destination' }));
    expect(screen.getByLabelText('Location')).toHaveTextContent(
      prefix + '/products/item?saved=1#details',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Location')).toHaveTextContent(
      prefix + '/products/item/edit?mode=1#form',
    );
  },
);
