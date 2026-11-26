import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it } from 'vitest';
import { renderInEnglish } from '../../test/render';
import { ShopDirectoryHero } from './ShopDirectoryHero';

function Url() {
  return <output aria-label="Directory URL">{useLocation().search}</output>;
}

it('starts with the Main query and resets the page while keeping other filters', () => {
  renderInEnglish(
    <MemoryRouter initialEntries={['/shop?q=tea&filter=open&page=2']}>
      <ShopDirectoryHero />
      <Url />
    </MemoryRouter>,
  );

  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Find restaurants in your community',
  );
  const search = screen.getByRole('searchbox', { name: 'Search stores' });
  expect(search).toHaveValue('tea');
  fireEvent.change(search, { target: { value: 'noodles' } });
  expect(screen.getByLabelText('Directory URL')).toHaveTextContent(
    '?q=noodles&filter=open',
  );
});
