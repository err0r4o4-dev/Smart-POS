import { isValidElement } from 'react';
import { matchRoutes } from 'react-router-dom';
import { expect, it } from 'vitest';
import { router } from '../../app/router';
import { RequireSession } from '../../app/ProtectedRoute';
import { MFASettingsPage } from '../../app/route-pages';
import { OrganizationWorkspaceProvider } from '../workspace/WorkspacePages';

it('requires a verified session without loading an organization before MFA', () => {
  const matches = matchRoutes(router.routes, '/security')!;
  const types = matches.map(({ route }) =>
    isValidElement(route.element) ? route.element.type : null,
  );
  expect(types).toContain(RequireSession);
  expect(types).toContain(MFASettingsPage);
  expect(types).not.toContain(OrganizationWorkspaceProvider);
});
