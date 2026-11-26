import { fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useState } from 'react';
import { expect, it } from 'vitest';
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

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['storefront', 'first', 'settings'], {
    name: 'First Bistro',
    accepting_orders: true,
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
