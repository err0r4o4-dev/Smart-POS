import { fireEvent, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it } from 'vitest';
import { renderInEnglish } from '../../test/render';
import { VeloAssistantChat, type AssistantScope } from './VeloAssistantChat';

function setup(scope: AssistantScope = { mode: 'discovery' }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['storefront-directory'], []);
  client.setQueryData(['storefront', 'bistro', 'settings'], {
    name: 'Corner Bistro',
    accepting_orders: true,
  });
  client.setQueryData(
    [
      'storefront',
      'bistro',
      'products',
      'availability=available&max_price=100',
    ],
    {
      items: [
        {
          variant_id: 'v1',
          product_name: 'Bistro Soup',
          unit_price: '75.00',
          saleable: true,
        },
      ],
    },
  );
  return renderInEnglish(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <VeloAssistantChat defaultOpen scope={scope} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function ask(text: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Type your message' }), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
}

it('reports an empty directory without inventing a store', () => {
  setup();
  ask('What is open?');
  expect(screen.getByText(/no matching stores/i)).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /yam/i })).not.toBeInTheDocument();
});

it('uses the selected restaurant catalog and the requested price limit', async () => {
  setup({ mode: 'store', slug: 'bistro' });
  ask('Show me dishes under 100 baht');
  expect(await screen.findByText(/Bistro Soup/)).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'Corner Bistro assistant' }),
  ).toBeInTheDocument();
});

it('answers a merchant with the kitchen help article', () => {
  setup({ mode: 'merchant', organizationName: 'Corner Bistro' });
  ask('Why is my paid order missing from the kitchen queue?');
  expect(screen.getByRole('link', { name: 'Read the guide' })).toHaveAttribute(
    'href',
    '/help#faq-kitchen',
  );
});

it('offers an editable unsent report when the store cannot accept orders', () => {
  setup({ mode: 'merchant', organizationName: 'Corner Bistro' });
  ask('We cannot accept orders right now');
  fireEvent.click(screen.getByRole('button', { name: 'Prepare a report for this issue' }));
  const draft = screen.getByRole('textbox', { name: 'Problem report draft' });
  expect(draft).toHaveValue(expect.stringContaining('Corner Bistro'));
  expect(draft).toHaveValue(expect.stringContaining('Unable to accept orders'));
  expect(screen.getByText(/hasn.t been sent/)).toBeInTheDocument();
});
