import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { renderInEnglish } from '../../test/render';
import { SetupLocationPicker } from './SetupLocationPicker';
import type { SetupLocation } from './setup-api';

function Picker() {
  const [value, setValue] = useState<SetupLocation>();
  return <SetupLocationPicker value={value} onChange={setValue} />;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('searches only on request and rejects empty provider coordinates', async () => {
  vi.stubEnv('VITE_LOCATION_SEARCH_URL', 'https://search.example.test/search');
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [
      { display_name: 'Invalid empty coordinates', lat: '', lon: '' },
      { display_name: 'Restaurant entrance', lat: '13.75', lon: '100.5' },
    ],
  });
  vi.stubGlobal('fetch', fetcher);
  renderInEnglish(<Picker />);
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Search place or address'), {
    target: { value: 'Restaurant' },
  });
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Search location' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Restaurant entrance' }),
  );
  expect(
    screen.queryByRole('button', { name: 'Invalid empty coordinates' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Latitude')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Store address')).toHaveValue(
    'Restaurant entrance',
  );
  expect(fetcher).toHaveBeenCalledWith(
    expect.any(URL),
    expect.objectContaining({
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    }),
  );
  expect((fetcher.mock.calls[0][0] as URL).searchParams.get('q')).toBe(
    'Restaurant',
  );
  expect(screen.getByRole('status')).toHaveTextContent('Location confirmed');
});

it('ignores search results after the query changes', async () => {
  vi.stubEnv('VITE_LOCATION_SEARCH_URL', 'https://search.example.test/search');
  let finishSearch!: (response: unknown) => void;
  const fetcher = vi.fn(
    () =>
      new Promise((resolve) => {
        finishSearch = resolve;
      }),
  );
  vi.stubGlobal('fetch', fetcher);
  renderInEnglish(<Picker />);
  fireEvent.change(screen.getByLabelText('Search place or address'), {
    target: { value: 'Old query' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search location' }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
  fireEvent.change(screen.getByLabelText('Search place or address'), {
    target: { value: 'New query' },
  });
  await act(async () =>
    finishSearch({
      ok: true,
      json: async () => [{ display_name: 'Old result', lat: '13', lon: '100' }],
    }),
  );
  expect(
    screen.queryByRole('button', { name: 'Old result' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Latitude')).not.toBeInTheDocument();
});

it('opens the map and hides raw coordinates', () => {
  renderInEnglish(<Picker />);
  expect(screen.getByLabelText('Store location map')).toBeVisible();
  expect(screen.queryByLabelText('Latitude')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Longitude')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Confirm store location' })).not.toBeInTheDocument();
});

it('confirms a searched location automatically', async () => {
  vi.stubEnv('VITE_LOCATION_SEARCH_URL', 'https://search.example.test/search');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ display_name: 'Store entrance', lat: '13.75', lon: '100.5' }],
  }));
  renderInEnglish(<Picker />);
  fireEvent.change(screen.getByLabelText('Search place or address'), { target: { value: 'Store' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search location' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Store entrance' }));
  expect(screen.getByRole('status')).toHaveTextContent('Location confirmed');
});
