import { useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight,
  Clock,
  Flame,
  Minus,
  Package,
  Paperclip,
  SendHorizonal,
  Store,
  X,
} from 'lucide-react';
import { useLanguage } from '../../app/language';
import {
  storefrontRequest,
  type ShopDirectoryEntry,
} from '../../lib/storefront-api';
import './velo-assistant.css';

export function VeloRobotAvatar({ size = 42 }: { size?: number }) {
  const gradientId = useId();
  return (
    <div
      className="velo-robot-avatar"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="0"
            y1="0"
            x2="48"
            y2="48"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#fde047" />
            <stop offset="1" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        {/* Soft squircle background */}
        <rect width="48" height="48" rx="14" fill={'url(#' + gradientId + ')'} />
        {/* Antenna */}
        <line
          x1="24"
          y1="7"
          x2="24"
          y2="13"
          stroke="#854d0e"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="24" cy="6.5" r="3" fill="#854d0e" />
        {/* Head */}
        <rect
          x="9.5"
          y="13"
          width="29"
          height="23"
          rx="7"
          fill="#fef08a"
          stroke="#ca8a04"
          strokeWidth="1.8"
        />
        {/* Left & Right Ears */}
        <rect x="6.5" y="21" width="3" height="7" rx="1.5" fill="#ca8a04" />
        <rect x="38.5" y="21" width="3" height="7" rx="1.5" fill="#ca8a04" />
        {/* Screen / Face */}
        <rect
          x="13.5"
          y="16.5"
          width="21"
          height="15"
          rx="5"
          fill="#ffffff"
        />
        {/* Eyes */}
        <rect
          x="17.5"
          y="21"
          width="3.2"
          height="4.5"
          rx="1.6"
          fill="#1f2937"
        />
        <rect
          x="27.3"
          y="21"
          width="3.2"
          height="4.5"
          rx="1.6"
          fill="#1f2937"
        />
        {/* Smile */}
        <path
          d="M20.5 26.5c1 1.8 6 1.8 7 0"
          stroke="#1f2937"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

interface ChatStoreCard {
  slug: string;
  name: string;
  accepting_orders: boolean;
}

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  time: string;
  stores?: ChatStoreCard[];
  trackingLink?: boolean;
}

export function VeloAssistantChat({ defaultOpen = false }: { defaultOpen?: boolean } = {}) {
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [input, setInput] = useState('');
  const launcherRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const shops = useQuery({
    queryKey: ['storefront-directory'],
    queryFn: async ({ signal }) => {
      const items = await storefrontRequest<ShopDirectoryEntry[]>('', {
        signal,
        storeMode: () => {},
      });
      return items ?? [];
    },
    enabled: isOpen,
    staleTime: 60_000,
  });

  const openStores = useMemo(
    () => (Array.isArray(shops.data) ? shops.data.filter((s) => s?.accepting_orders) : []),
    [shops.data],
  );

  const primaryStore: ChatStoreCard = useMemo(() => {
    if (openStores.length > 0) {
      return {
        slug: openStores[0].slug,
        name: openStores[0].name,
        accepting_orders: openStores[0].accepting_orders,
      };
    }
    return {
      slug: "yam",
      name: "yam",
      accepting_orders: true,
    };
  }, [openStores]);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init-1",
      sender: "bot",
      text: "Hi! I can help you find a restaurant or recommend dishes.",
      time: "10:24 AM",
    },
    {
      id: "init-2",
      sender: "bot",
      text: "You can ask things like: best noodles, open stores, or vegetarian options.",
      time: "10:24 AM",
    },
    {
      id: "init-3",
      sender: "user",
      text: "Show me stores that are open now.",
      time: "10:25 AM",
    },
    {
      id: "init-4",
      sender: "bot",
      text: "Here are stores that are open now:",
      time: "10:25 AM",
    },
  ]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  };

  const getTimeString = () => {
    const now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleSendPrompt = (promptText: string) => {
    if (!promptText.trim()) return;

    const time = getTimeString();
    const userMsg: ChatMessage = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: promptText,
      time,
    };

    let botResponse: ChatMessage;
    const lower = promptText.toLowerCase();

    if (
      lower.includes('open') ||
      lower.includes('เปิด') ||
      lower.includes('stores that are open')
    ) {
      const active = openStores.length > 0 ? openStores : [primaryStore];
      botResponse = {
        id: 'bot-' + (Date.now() + 1),
        sender: 'bot',
        text: 'Here are stores that are open now:',
        time,
        stores: active.slice(0, 3).map((s) => ({
          slug: s.slug,
          name: s.name,
          accepting_orders: s.accepting_orders,
        })),
      };
    } else if (
      lower.includes('dish') ||
      lower.includes('menu') ||
      lower.includes('noodle') ||
      lower.includes('เมนู') ||
      lower.includes('อาหาร')
    ) {
      botResponse = {
        id: 'bot-' + (Date.now() + 1),
        sender: 'bot',
        text:
          language === 'th'
            ? 'เมนูยอดนิยมวันนี้ประกอบด้วย ก๋วยเตี๋ยวต้มยำโบราณ, ข้าวราดกะเพราเนื้อ, และชาเขียวมัทฉะลาเต้! คุณสามารถเลือกดูร้านค้าเพื่อเริ่มสั่งได้ทันที'
            : 'Popular recommendations today include signature noodles, basil bowls, and handcrafted matcha lattes! Choose an open store to explore its full menu.',
        time,
        stores: openStores.length > 0 ? [primaryStore] : undefined,
      };
    } else if (
      lower.includes('track') ||
      lower.includes('order') ||
      lower.includes('ติดตาม') ||
      lower.includes('ออเดอร์')
    ) {
      botResponse = {
        id: 'bot-' + (Date.now() + 1),
        sender: 'bot',
        text:
          language === 'th'
            ? 'คุณสามารถติดตามสถานะคำสั่งซื้อแบบเรียลไทม์ได้ที่นี่:'
            : 'You can check your order status anytime using our live tracking page:',
        time,
        trackingLink: true,
      };
    } else {
      const match = Array.isArray(shops.data)
        ? shops.data.find((s) => s?.name && s.name.toLowerCase().includes(lower))
        : undefined;
      if (match) {
        botResponse = {
          id: 'bot-' + (Date.now() + 1),
          sender: 'bot',
          text:
            language === 'th'
              ? 'พบร้านค้าที่คุณกำลังค้นหา: ' + match.name
              : 'I found this store matching your search: ' + match.name,
          time,
          stores: [
            {
              slug: match.slug,
              name: match.name,
              accepting_orders: match.accepting_orders,
            },
          ],
        };
      } else {
        botResponse = {
          id: 'bot-' + (Date.now() + 1),
          sender: 'bot',
          text:
            language === 'th'
              ? 'ยินดีให้ความช่วยเหลือครับ! คุณสามารถสอบถามเกี่ยวกับร้านค้าที่เปิดอยู่ เมนูแนะนำ หรือติดตามคำสั่งซื้อได้เลยครับ'
              : "I'm here to help! You can ask about stores that are open now, popular dishes, or how to track your order.",
          time,
        };
      }
    }

    setMessages((prev) => [...prev, userMsg, botResponse]);
    setTimeout(scrollToBottom, 50);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const text = input;
    setInput('');
    handleSendPrompt(text);
  };

  return (
    <aside className="velo-assistant-root" aria-label="VELO Assistant">
      {/* Floating Launcher Button */}
      <button
        ref={launcherRef}
        type="button"
        className="velo-chat-launcher"
        aria-label={
          language === 'th'
            ? 'เปิดผู้ช่วย VELO Assistant'
            : 'Open VELO Assistant chat'
        }
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className="velo-chat-launcher-icon" aria-hidden="true">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#1f1d1a"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
            <circle cx="8.5" cy="12" r="1.1" fill="#1f1d1a" stroke="none" />
            <circle cx="12" cy="12" r="1.1" fill="#1f1d1a" stroke="none" />
            <circle cx="15.5" cy="12" r="1.1" fill="#1f1d1a" stroke="none" />
          </svg>
        </span>
        <span className="velo-chat-launcher-sparks" aria-hidden="true">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#eab308"
            strokeWidth="2.8"
            strokeLinecap="round"
          >
            <line x1="14" y1="4" x2="20" y2="4" />
            <line x1="18" y1="10" x2="22" y2="14" />
            <line x1="10" y1="2" x2="14" y2="8" />
          </svg>
        </span>
      </button>

      {/* Floating Chat Modal / Card */}
      {isOpen && (
        <section
          className="velo-chat-window"
          role="dialog"
          aria-label="VELO Assistant"
          aria-modal="false"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setIsOpen(false);
              launcherRef.current?.focus();
            }
          }}
        >
          {/* Header */}
          <div className="velo-chat-header">
            <div className="velo-chat-header-info">
              <VeloRobotAvatar size={42} />
              <div className="velo-chat-header-titles">
                <h2 className="velo-chat-title">VELO Assistant</h2>
                <p className="velo-chat-subtitle">
                  Ask about stores, menus, or orders
                </p>
              </div>
            </div>
            <div className="velo-chat-header-actions">
              <span className="velo-chat-status">
                <span className="velo-chat-status-dot" aria-hidden="true" />
                Online
              </span>
              <button
                type="button"
                className="velo-chat-icon-btn"
                aria-label={
                  language === 'th' ? 'ย่อหน้าต่างแชท' : 'Minimize chat'
                }
                onClick={() => setIsOpen(false)}
              >
                <Minus size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="velo-chat-icon-btn"
                aria-label={language === 'th' ? 'ปิดแชท' : 'Close chat'}
                onClick={() => setIsOpen(false)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="velo-chat-body" tabIndex={0}>
            <div className="velo-chat-date-pill">Today</div>

            {messages.map((msg) => {
              const storesToRender = msg.id === "init-4" ? [primaryStore] : msg.stores;
              return (
              <div
                key={msg.id}
                className={'velo-chat-msg-row velo-chat-msg-' + msg.sender}
              >
                {msg.sender === 'bot' && <VeloRobotAvatar size={28} />}
                <div className="velo-chat-msg-content">
                  <div className="velo-chat-bubble">
                    <p>{msg.text}</p>
                    {storesToRender && storesToRender.length > 0 && (
                      <div className="velo-chat-stores-list">
                        {storesToRender.map((store) => (
                          <Link
                            key={store.slug}
                            to={'/shop/' + encodeURIComponent(store.slug)}
                            className="velo-chat-store-card"
                          >
                            <div className="velo-chat-store-icon">
                              <Store
                                size={22}
                                strokeWidth={2}
                                aria-hidden="true"
                              />
                            </div>
                            <div className="velo-chat-store-info">
                              <span className="velo-chat-store-name">
                                {store.name}
                              </span>
                              <span className="velo-chat-store-status">
                                <span
                                  className="velo-chat-store-dot"
                                  aria-hidden="true"
                                />
                                {store.accepting_orders
                                  ? 'Accepting orders'
                                  : 'Not accepting orders'}
                              </span>
                            </div>
                            <ChevronRight
                              size={18}
                              className="velo-chat-store-arrow"
                              aria-hidden="true"
                            />
                          </Link>
                        ))}
                      </div>
                    )}
                    {msg.trackingLink && (
                      <Link
                        to="/shop/tracking"
                        className="velo-chat-store-card velo-chat-tracking-card"
                      >
                        <div className="velo-chat-store-icon velo-chat-track-icon">
                          <Package
                            size={22}
                            strokeWidth={2}
                            aria-hidden="true"
                          />
                        </div>
                        <div className="velo-chat-store-info">
                          <span className="velo-chat-store-name">
                            {language === 'th'
                              ? 'หน้าติดตามคำสั่งซื้อ'
                              : 'Track Order Page'}
                          </span>
                          <span className="velo-chat-store-status">
                            {language === 'th'
                              ? 'ใส่รหัสคำสั่งซื้อเพื่อดูสถานะ'
                              : 'Enter token to see live status'}
                          </span>
                        </div>
                        <ChevronRight
                          size={18}
                          className="velo-chat-store-arrow"
                          aria-hidden="true"
                        />
                      </Link>
                    )}
                  </div>
                  <div className="velo-chat-timestamp">
                    <span>{msg.time}</span>
                    {msg.sender === 'user' && (
                      <span
                        className="velo-chat-checks"
                        aria-label="ส่งแล้วและอ่านแล้ว"
                      >
                        ✓✓
                      </span>
                    )}
                  </div>
                </div>
              </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick suggestions chips */}
          <div
            className="velo-chat-suggestions"
            role="group"
            aria-label="คำถามแนะนำ"
          >
            <button
              type="button"
              className="velo-chat-chip"
              onClick={() =>
                handleSendPrompt('Show me stores that are open now.')
              }
            >
              <Clock size={15} aria-hidden="true" />
              <span>Open now</span>
            </button>
            <button
              type="button"
              className="velo-chat-chip"
              onClick={() =>
                handleSendPrompt('Show me popular dishes.')
              }
            >
              <Flame size={15} aria-hidden="true" />
              <span>Popular dishes</span>
            </button>
            <button
              type="button"
              className="velo-chat-chip"
              onClick={() =>
                handleSendPrompt('How can I track my order?')
              }
            >
              <Package size={15} aria-hidden="true" />
              <span>Track order</span>
            </button>
          </div>

          {/* Footer Input Bar */}
          <form className="velo-chat-footer" onSubmit={handleFormSubmit}>
            <div className="velo-chat-input-wrapper">
              <button
                type="button"
                className="velo-chat-attach-btn"
                aria-label={language === 'th' ? 'แนบไฟล์' : 'Attach file'}
                title={language === 'th' ? 'แนบไฟล์' : 'Attach file'}
                onClick={() => {}}
              >
                <Paperclip size={18} aria-hidden="true" />
              </button>
              <input
                type="text"
                className="velo-chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                aria-label="Type your message"
              />
              <button
                type="submit"
                className="velo-chat-send-btn"
                disabled={!input.trim()}
                aria-label={language === 'th' ? 'ส่งข้อความ' : 'Send message'}
              >
                <SendHorizonal size={16} aria-hidden="true" />
              </button>
            </div>
          </form>
        </section>
      )}
    </aside>
  );
}
