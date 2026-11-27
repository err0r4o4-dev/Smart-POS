import { isValidElement } from 'react';
import { matchRoutes } from 'react-router-dom';
import { expect, it } from 'vitest';
import { router } from '../../app/router';
import { RequireSession } from '../../app/ProtectedRoute';
import { PublicAccountPage } from './PublicAccountPage';

it('puts the shared account profile behind a session requirement', () => {
  const matches = matchRoutes(router.routes, '/account');
  const element = matches?.at(-1)?.route.element;
  expect(isValidElement(element)).toBe(true);
  expect(isValidElement(element) && element.type).toBe(PublicAccountPage);
  expect(
    matches?.some(
      ({ route }) =>
        isValidElement(route.element) && route.element.type === RequireSession,
    ),
  ).toBe(true);
});
