import { createElement } from 'react';
import type { RouteObject } from 'react-router-dom';
import { LegacyWorkspaceRedirect } from '../features/workspace/WorkspaceRouting';
import { isBusinessPath, workspacePath } from './workspace-paths';

export function scopeWorkspaceRoutes(routes: RouteObject[]): RouteObject[] {
  return routes.flatMap((route): RouteObject[] => {
    if (route.children)
      return [{ ...route, children: scopeWorkspaceRoutes(route.children) }];
    if (!route.path || !isBusinessPath(route.path)) return [route];
    return [
      {
        ...route,
        element: createElement(LegacyWorkspaceRedirect, { path: route.path }),
      },
      { ...route, path: workspacePath(route.path, 'management') },
    ];
  });
}
