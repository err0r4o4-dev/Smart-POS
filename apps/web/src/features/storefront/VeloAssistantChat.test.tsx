import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { useLanguage } from '../../app/language';
import { renderInEnglish } from '../../test/render';
import { VeloAssistantChat } from './VeloAssistantChat';

function Harness() {
  const [slug, setSlug] = useState('first');
  const { setLanguage } = useLanguage();
  return (
    <>
      <button onClick={() => setLanguage('th')}>Switch to Thai</button>
      <button onClick={() => setSlug('second')}>Switch store</button>
      <VeloAssistantChat defaultOpen scope={{ mode: 'store', slug }} />
    </>
  );
}

function setup(assistantEnabled = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['storefront', 'first', 'settings'], {
    name: 'First Bistro',
    accepting_orders: true,
    assistant_enabled: assistantEnabled,
  });
  client.setQueryData(['storefront', 'second', 'settings'], {
    name: 'Second Bistro',
    accepting_orders: false,
  });
  return renderInEnglish(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Harness />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('returns focus to the launcher when the chat is closed with Escape', () => {
  setup();
  const input = screen.getByRole('textbox', { name: 'Type your message' });
  expect(input).toHaveFocus();
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Open VELO Assistant chat' }),
  ).toHaveFocus();
});

it('answers store questions with current menu results and carries follow-up context', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
    Response.json({ data: { intent: 'menu', items: [{ product_name: 'Soup', variant_name: 'Soup', unit_price: '79.00' }] } }),
  );
  vi.stubGlobal('fetch', fetcher);
  try {
    setup(true);
    const ask = (text: string) => {
      fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    };
    ask('Anything under 150?');
    expect(await screen.findByText('Soup · ฿79.00')).toBeInTheDocument();
    ask('Anything cheaper?');
    await waitFor(() => expect(screen.getAllByText('Soup · ฿79.00')).toHaveLength(2));
    expect(fetcher.mock.calls[1]?.[0]).toBe('/api/v1/storefronts/first/assistant');
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      questions: ['Anything under 150?', 'Anything cheaper?'],
      previous_price: '79.00',
    });
  } finally {
    vi.unstubAllGlobals();
  }
});

it('keeps tracking local and falls back to the store answer if the model is unavailable', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
    Response.json({ error: { code: 'UNAVAILABLE' } }, { status: 503 }),
  );
  vi.stubGlobal('fetch', fetcher);
  try {
    setup(true);
    fireEvent.click(screen.getByRole('button', { name: 'Track order' }));
    expect(screen.getByText(/Use the private tracking link/)).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Any ideas?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText(/Ask about this restaurant/)).toHaveLength(2));
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ questions: ['Any ideas?'] });
  } finally {
    vi.unstubAllGlobals();
  }
});

it('keeps the question when the assistant asks for a detail', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
    Response.json({ data: { intent: 'clarify', items: [] } }),
  );
  vi.stubGlobal('fetch', fetcher);
  try {
    setup(true);
    const input = screen.getByRole('textbox');
    const send = screen.getByRole('button', { name: 'Send message' });
    fireEvent.change(input, { target: { value: 'Can you suggest some soup?' } });
    fireEvent.click(send);
    await screen.findByText(/Tell me which dish/);
    fireEvent.change(input, { target: { value: 'Under 80' } });
    fireEvent.click(send);
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body))).toEqual({
      questions: ['Can you suggest some soup?', 'Under 80'],
    });
    await waitFor(() => expect(screen.getAllByText(/Tell me which dish/)).toHaveLength(2));
  } finally {
    vi.unstubAllGlobals();
  }
});

it('translates a tracking answer without changing the customer’s draft', () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Track order' }));
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Unsent text' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Switch to Thai' }));
  expect(screen.getByRole('textbox', { name: 'พิมพ์ข้อความ' })).toHaveValue(
    'Unsent text',
  );
  expect(screen.getByText(/ใช้ลิงก์ติดตามส่วนตัว/)).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: /ติดตาม/ }),
  ).not.toBeInTheDocument();
});

it('clears a prior restaurant’s answers and draft on a store switch', () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: 'Track order' }));
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Unsent text' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Switch store' }));
  expect(
    screen.getByRole('dialog', { name: 'Second Bistro assistant' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(
    screen.queryByText(/Use the private tracking link/),
  ).not.toBeInTheDocument();
});
