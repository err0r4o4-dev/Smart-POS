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
  expect(screen.getByLabelText('Latitude')).toHaveValue(13.75);
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
  expect(screen.getByRole('status')).not.toHaveTextContent(
    'Location confirmed',
  );
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
  expect(screen.getByLabelText('Latitude')).toHaveValue(null);
});

it('ignores a late GPS result after manual location edits', () => {
  let reportPosition: PositionCallback | undefined;
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: (success: PositionCallback) => {
        reportPosition = success;
      },
    },
  });
  renderInEnglish(<Picker />);
  fireEvent.click(screen.getByRole('button', { name: 'Use current location' }));
  fireEvent.change(screen.getByLabelText('Latitude'), {
    target: { value: '14' },
  });
  act(() =>
    reportPosition?.({
      coords: { latitude: 15, longitude: 101 },
    } as GeolocationPosition),
  );
  expect(screen.getByLabelText('Latitude')).toHaveValue(14);
});

it('requires a real coordinate pair and address before confirming', () => {
  renderInEnglish(<Picker />);
  expect(
    screen.getByRole('button', { name: 'Confirm store location' }),
  ).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Latitude'), {
    target: { value: '13.75' },
  });
  fireEvent.change(screen.getByLabelText('Longitude'), {
    target: { value: '100.5' },
  });
  fireEvent.change(screen.getByLabelText('Store address'), {
    target: { value: 'Store entrance' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Confirm store location' }),
  );
  expect(screen.getByRole('status')).toHaveTextContent('Location confirmed');
  fireEvent.change(screen.getByLabelText('Latitude'), {
    target: { value: '14' },
  });
  expect(screen.getByRole('status')).not.toHaveTextContent(
    'Location confirmed',
  );
});

it('does not turn a missing coordinate into zero', () => {
  renderInEnglish(<Picker />);
  fireEvent.change(screen.getByLabelText('Latitude'), {
    target: { value: '0' },
  });
  fireEvent.change(screen.getByLabelText('Store address'), {
    target: { value: 'Store entrance' },
  });
  expect(
    screen.getByRole('button', { name: 'Confirm store location' }),
  ).toBeDisabled();
});
