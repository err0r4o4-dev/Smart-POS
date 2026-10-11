import { createElement } from 'react';
import { expect, it } from 'vitest';
import { scopeWorkspaceRoutes } from './workspace-routes';

it('retains existing permission parents and page elements for both scoped paths', () => {
  const gate = createElement('div', { id: 'permission-gate' });
  const page = createElement('h1', null, 'Product');
  const routes = scopeWorkspaceRoutes([
    { element: gate, children: [{ path: '/products/:id', element: page }] },
  ]);
  expect(routes[0].element).toBe(gate);
  expect(routes[0].children?.map((route) => route.path)).toEqual([
    '/products/:id',
    '/manage/products/:id',
    '/work/products/:id',
  ]);
  expect(routes[0].children?.[1].element).toBe(page);
  expect(routes[0].children?.[2].element).toBe(page);
  expect(routes[0].children?.[0].element).not.toBe(page);
});

it('does not publish admin pages in work or rewrite customer and account routes', () => {
  const routes = scopeWorkspaceRoutes([
    { path: '/settings/store' },
    { path: '/pricing' },
    { path: '/shop' },
    { path: '/account' },
    { path: '/manage/dashboard' },
    { path: '/work' },
  ]);
  expect(routes.map((route) => route.path)).toEqual([
    '/settings/store',
    '/manage/settings/store',
    '/pricing',
    '/manage/pricing',
    '/shop',
    '/account',
    '/manage/dashboard',
    '/work',
  ]);
});
