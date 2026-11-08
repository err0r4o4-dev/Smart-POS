import type { RouteObject } from 'react-router-dom';

export function scopeWorkspaceRoutes(routes: RouteObject[]): RouteObject[] {
  return routes.map((route): RouteObject => {
    if (route.children) {
      return { ...route, children: scopeWorkspaceRoutes(route.children) };
    }
    return route;
  });
}
