import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInEnglish } from '../../test/render';
import { useLanguage } from '../../app/language';
import { VeloAssistantChat } from './VeloAssistantChat';

const mockShops = [
  {
    slug: 'yam',
    name: 'yam',
    accepting_orders: true,
    business_type: 'RESTAURANT',
  },
  {
    slug: 'closed-shop',
    name: 'Closed Store',
    accepting_orders: false,
    business_type: 'CAFE',
  },
];

function renderChat() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  queryClient.setQueryData(['storefront-directory'], mockShops);

  return renderInEnglish(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/shop']}>
        <LanguageToggle />
        <VeloAssistantChat defaultOpen={true} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function LanguageToggle() {
  const { setLanguage } = useLanguage();
  return (
    <>
      <button onClick={() => setLanguage('th')}>Switch to Thai</button>
      <button onClick={() => setLanguage('en')}>Switch to English</button>
    </>
  );
}

describe('VeloAssistantChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates fixed conversation copy when language changes while preserving typed text and store names', async () => {
    renderChat();
    const input = screen.getByRole('textbox', { name: 'Type your message' });
    fireEvent.change(input, { target: { value: 'yam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    expect(
      await screen.findByText('I found this store matching your search: yam'),
    ).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'Online' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    fireEvent.change(input, { target: { value: 'Unsent text' } });

    fireEvent.click(screen.getByRole('button', { name: 'Switch to Thai' }));

    expect(
      screen.getByText('พบร้านค้าที่คุณกำลังค้นหา: yam'),
    ).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'พิมพ์ข้อความ' })).toHaveValue(
      'Unsent text',
    );
    expect(
      screen.getByText('สวัสดี! ฉันช่วยคุณค้นหาร้านอาหารหรือแนะนำเมนูได้'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('group', { name: 'คำถามแนะนำ' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /yam/ }).length).toBeGreaterThan(
      0,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch to English' }));
    expect(
      screen.getByText('I found this store matching your search: yam'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Type your message' }),
    ).toHaveValue('Unsent text');
  });

  it('localizes quick prompts, their replies, and accessible labels after a language switch', () => {
    renderChat();
    fireEvent.click(screen.getByRole('button', { name: 'Track order' }));
    expect(screen.getByText('How can I track my order?')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Sent and read').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Thai' }));
    expect(
      screen.getByText('ฉันจะติดตามคำสั่งซื้อได้อย่างไร'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('คุณสามารถติดตามสถานะคำสั่งซื้อแบบเรียลไทม์ได้ที่นี่:'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /หน้าติดตามคำสั่งซื้อ/ }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByLabelText('ส่งแล้วและอ่านแล้ว').length,
    ).toBeGreaterThan(0);
  });

  it('renders launcher button and chat window on initial load', () => {
    renderChat();

    // Launcher button exists
    const launcher = screen.getByRole('button', {
      name: /VELO Assistant/i,
    });
    expect(launcher).toBeInTheDocument();

    // Chat window is open
    expect(
      screen.getByRole('dialog', { name: 'VELO Assistant' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'VELO Assistant' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Ask about stores, menus, or orders'),
    ).toBeInTheDocument();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });

  it('displays initial messages matching the reference screenshot', () => {
    renderChat();

    expect(
      screen.getByText(
        'Hi! I can help you find a restaurant or recommend dishes.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'You can ask things like: best noodles, open stores, or vegetarian options.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Show me stores that are open now.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Here are stores that are open now:'),
    ).toBeInTheDocument();

    // Store card for open store 'yam'
    const yamLinks = screen.getAllByRole('link', { name: /yam/i });
    expect(yamLinks.length).toBeGreaterThan(0);
    expect(screen.getAllByText('Accepting orders').length).toBeGreaterThan(0);
  });

  it('can be closed and reopened via launcher button', () => {
    renderChat();

    const closeBtn = screen.getByRole('button', { name: /Close chat|ปิดแชท/i });
    fireEvent.click(closeBtn);

    expect(
      screen.queryByRole('dialog', { name: 'VELO Assistant' }),
    ).not.toBeInTheDocument();

    // Reopen
    const launcher = screen.getByRole('button', {
      name: /VELO Assistant/i,
    });
    fireEvent.click(launcher);

    expect(
      screen.getByRole('dialog', { name: 'VELO Assistant' }),
    ).toBeInTheDocument();
  });

  it('can be closed via Escape key', () => {
    renderChat();

    const dialog = screen.getByRole('dialog', { name: 'VELO Assistant' });
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(
      screen.queryByRole('dialog', { name: 'VELO Assistant' }),
    ).not.toBeInTheDocument();
  });

  it('sends message and updates conversation when quick prompt chip is clicked', async () => {
    renderChat();

    const popularChip = screen.getByRole('button', { name: /Popular dishes/i });
    fireEvent.click(popularChip);

    await waitFor(() => {
      expect(screen.getByText('Show me popular dishes.')).toBeInTheDocument();
      expect(
        screen.getByText(/ก๋วยเตี๋ยวต้มยำ|signature noodles/i),
      ).toBeInTheDocument();
    });
  });

  it('sends message and displays tracking link card when Track order chip is clicked', async () => {
    renderChat();

    const trackChip = screen.getByRole('button', { name: /Track order/i });
    fireEvent.click(trackChip);

    await waitFor(() => {
      expect(
        screen.getByRole('link', {
          name: /(?:Track Order Page|หน้าติดตามคำสั่งซื้อ)/i,
        }),
      ).toBeInTheDocument();
    });
  });

  it('submits typed message from input field and displays assistant reply', async () => {
    renderChat();

    const input = screen.getByRole('textbox', { name: /Type your message/i });
    const sendBtn = screen.getByRole('button', {
      name: /Send message|ส่งข้อความ/i,
    });

    expect(sendBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: 'Any noodles available?' } });
    expect(sendBtn).not.toBeDisabled();

    fireEvent.click(sendBtn);

    await waitFor(() => {
      expect(screen.getByText('Any noodles available?')).toBeInTheDocument();
      expect(
        screen.getByText(/(?:Popular recommendations|เมนูยอดนิยม)/i),
      ).toBeInTheDocument();
    });
  });
});
