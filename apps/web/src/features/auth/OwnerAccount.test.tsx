import { isValidElement } from 'react';
import { matchRoutes } from 'react-router-dom';
import { expect, it } from 'vitest';
import { router } from '../../app/router';
import { SystemPage } from '../../app/route-pages';
import * as AuthPages from './AuthPages';

it('removes AccountPage export and routes /account to 404 SystemPage', () => {
  expect('AccountPage' in AuthPages).toBe(false);
  const matches = matchRoutes(router.routes, '/account');
  const element = matches?.at(-1)?.route.element;
  expect(isValidElement(element)).toBe(true);
  expect(isValidElement(element) && element.type).toBe(SystemPage);
});
