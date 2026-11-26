import { createElement } from 'react';
import { expect, it } from 'vitest';
import { scopeWorkspaceRoutes } from './workspace-routes';

it('preserves clean root restaurant routes and permission parents without /manage duplication', () => {
  const gate = createElement('div', { id: 'permission-gate' });
  const page = createElement('h1', null, 'Menu item');
  const routes = scopeWorkspaceRoutes([
    { element: gate, children: [{ path: '/menu/:id', element: page }] },
  ]);
  expect(routes[0].element).toBe(gate);
  expect(routes[0].children?.map((route) => route.path)).toEqual(['/menu/:id']);
  expect(routes[0].children?.[0].element).toBe(page);
});

it('keeps settings, customer storefront, and dashboard routes at their clean paths', () => {
  const routes = scopeWorkspaceRoutes([
    { path: '/settings' },
    { path: '/settings/storefront' },
    { path: '/settings/payments' },
    { path: '/shop' },
    { path: '/dashboard' },
  ]);
  expect(routes.map((route) => route.path)).toEqual([
    '/settings',
    '/settings/storefront',
    '/settings/payments',
    '/shop',
    '/dashboard',
  ]);
});
