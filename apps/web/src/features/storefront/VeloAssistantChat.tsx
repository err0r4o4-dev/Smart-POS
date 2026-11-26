import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageCircle, SendHorizontal, Store, X } from 'lucide-react';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import type { TranslationKey, UiMessage } from '../../i18n';
import { findMerchantGuide } from '../help/help-content';
import { exactDecimal } from '../../lib/pos-api';
import {
  storefrontRequest,
  type ShopCatalogPage,
  type ShopSettings,
  type StoreAssistantAnswer,
} from '../../lib/storefront-api';
import { foodCategories } from './food-categories';
import { useShopDirectory } from './useShopDirectory';
import './velo-assistant.css';
function VeloRobotAvatar({ size = 42 }: { size?: number }) {
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
        <rect
          width="48"
          height="48"
          rx="14"
          fill={'url(#' + gradientId + ')'}
        />
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
        <rect x="13.5" y="16.5" width="21" height="15" rx="5" fill="#ffffff" />
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

export type AssistantScope =
  | { mode: 'discovery' }
  | { mode: 'store'; slug: string }
  | { mode: 'merchant'; organizationName: string };

type Reply =
  | {
      kind: 'text';
      message: UiMessage;
      link?: { to: string; text: TranslationKey };
    }
  | { kind: 'directory'; query: string }
  | { kind: 'catalog'; slug: string; query: string }
  | { kind: 'assistant'; slug: string; answer: StoreAssistantAnswer }
  | { kind: 'pending' }
  | { kind: 'report'; issue: TranslationKey }
  | { kind: 'guide'; guide: NonNullable<ReturnType<typeof findMerchantGuide>> };

const discovery = { mode: 'discovery' } as const;
const prompts = {
  discovery: ['assistant.findOpen', 'assistant.findDelivery'],
  store: ['assistant.showMenu', 'assistant.askQueue', 'assistant.trackOrder'],
  merchant: [
    'assistant.addMenu',
    'assistant.kitchenHelp',
    'assistant.reportProblem',
  ],
} as const;
const greetings = {
  discovery: 'assistant.discoveryIntro',
  store: 'assistant.storeIntro',
  merchant: 'assistant.merchantIntro',
} as const;

function replyFor(scope: AssistantScope, question: string): Reply {
  const q = question.toLowerCase().normalize('NFKC');
  if (scope.mode === 'discovery') {
    if (/ใกล้|แถว|ย่าน|near|neighbou?rhood/.test(q)) {
      return {
        kind: 'text',
        message: { key: 'assistant.noArea' },
        link: { to: paths.shop, text: 'assistant.browseStores' },
      };
    }
    return { kind: 'directory', query: q };
  }
  if (scope.mode === 'merchant') {
    if (/เปิดรับออเดอร์ไม่ได้|รับออเดอร์ไม่ได้|(?:cannot|can.t|unable to) accept orders/.test(q)) {
      return { kind: 'report', issue: 'assistant.acceptOrdersIssue' };
    }
    const guide = findMerchantGuide(q);
    return guide
      ? { kind: 'guide', guide }
      : {
          kind: 'text',
          message: { key: 'assistant.guideFallback' },
          link: { to: paths.help, text: 'assistant.readGuide' },
        };
  }
  if (/ติดตาม|track|ของฉัน|my order/.test(q)) {
    return {
      kind: 'text',
      message: { key: 'assistant.privateTracking' },
    };
  }
  if (/คิว|รอนาน|queue|wait time/.test(q)) {
    return { kind: 'text', message: { key: 'assistant.noPublicQueue' } };
  }
  if (/เปิด|รับออเดอร์|accepting|open/.test(q)) {
    return { kind: 'text', message: { key: 'assistant.statusAtTop' } };
  }
  const budget = q.match(
    /(?:ไม่เกิน|ต่ำกว่า|under|up to|budget)\s*(\d{1,7}(?:\.\d{1,2})?)/,
  )?.[1];
  const search = q.match(/^(?:ค้นหาเมนู\s*|find dish\s+)(.+)$/)?.[1]?.trim();
  if (budget || search || /เมนู|ราคา|อาหาร|dish|menu/.test(q)) {
    const params = new URLSearchParams({ availability: 'available' });
    if (budget) params.set('max_price', budget);
    if (search) params.set('search', search);
    return { kind: 'catalog', slug: scope.slug, query: params.toString() };
  }
  return { kind: 'text', message: { key: 'assistant.storeIntro' } };
}

function DirectoryReply({ query }: { query: string }) {
  const { t } = useLanguage();
  const shops = useShopDirectory();
  const matchingCategory = foodCategories.find(({ code, label }) =>
    query.includes(code) || query.includes(t(label).toLowerCase()),
  );
  const open = /รับออเดอร์|เปิด|\bopen\b|accepting/.test(query);
  const delivery = /เดลิเวอรี|จัดส่ง|delivery/.test(query);
  const name = query
    .replace(/^(?:หาร้าน|find (?:a )?store|find)\s*/i, '')
    .trim();
  const results = (shops.data ?? [])
    .filter((shop) => {
      return (
        (!open || shop.accepting_orders) &&
        (!delivery || shop.delivery_enabled) &&
        (!matchingCategory || shop.category_codes?.includes(matchingCategory.code)) &&
        (open ||
          delivery ||
          matchingCategory ||
          (name && shop.name.toLowerCase().normalize('NFKC').includes(name)))
      );
    })
    .slice(0, 3);

  if (shops.isPending) return <p>{t('assistant.loading')}</p>;
  if (shops.isError)
    return (
      <button
        className="velo-chat-chip"
        type="button"
        onClick={() => void shops.refetch()}
      >
        {t('assistant.retryData')}
      </button>
    );
  if (!results.length) return <p>{t('assistant.noStores')}</p>;
  return (
    <div className="velo-chat-stores-list">
      {results.map((shop) => (
        <Link
          key={shop.slug}
          className="velo-chat-store-card"
          to={`${paths.shop}/${encodeURIComponent(shop.slug)}`}
        >
          <Store size={17} aria-hidden="true" />
          <span className="velo-chat-store-info">
            <strong>{shop.name}</strong>
            <small>

              {t(
                shop.accepting_orders
                  ? 'assistant.accepting'
                  : 'assistant.notAccepting',
              )}
            </small>
          </span>
        </Link>
      ))}
    </div>
  );
}

function CatalogReply({ slug, query }: { slug: string; query: string }) {
  const { t } = useLanguage();
  const catalog = useQuery({
    queryKey: ['storefront', slug, 'products', query],
    queryFn: ({ signal }) =>
      storefrontRequest<ShopCatalogPage>(
        `/${encodeURIComponent(slug)}/products?${query}`,
        { signal },
      ),
    retry: false,
  });
  if (catalog.isPending) return <p>{t('assistant.loading')}</p>;
  if (catalog.isError)
    return (
      <button
        className="velo-chat-chip"
        type="button"
        onClick={() => void catalog.refetch()}
      >
        {t('assistant.retryData')}
      </button>
    );
  const items =
    catalog.data?.items
      .filter((item) => item.saleable && !item.is_sold_out)
      .slice(0, 4) ?? [];
  if (!items.length) return <p>{t('assistant.noMenu')}</p>;
  return (
    <>
      <p>{t('assistant.availableMenu')}</p>
      <ul className="velo-chat-menu-list">
        {items.map((item) => (
          <li key={item.variant_id}>
            {item.product_name}
            {item.variant_name && item.variant_name !== item.product_name
              ? ` · ${item.variant_name}`
              : ''}{' '}
            · ฿{item.unit_price}
          </li>
        ))}
      </ul>
      <Link to={`${paths.shop}/${encodeURIComponent(slug)}`}>
        {t('assistant.viewMenu')}
      </Link>
    </>
  );
}

function Answer({ reply, openReport }: { reply: Reply; openReport: (issue: TranslationKey) => void }) {
  const { t, messageText } = useLanguage();
  if (reply.kind === 'pending') return <p>{t('assistant.loading')}</p>;
  if (reply.kind === 'assistant') {
    if (reply.answer.intent === 'clarify') return <p>{t('assistant.menuClarify')}</p>;
    if (!reply.answer.items.length) return <p>{t('assistant.noMenu')}</p>;
    return (
      <>
        <p>{t('assistant.availableMenu')}</p>
        <ul className="velo-chat-menu-list">
          {reply.answer.items.map((item, index) => (
            <li key={index}>
              {item.product_name}
              {item.variant_name && item.variant_name !== item.product_name
                ? ` · ${item.variant_name}` : ''}{' '}
              · ฿{item.unit_price}
            </li>
          ))}
        </ul>
        <Link to={`${paths.shop}/${encodeURIComponent(reply.slug)}`}>{t('assistant.viewMenu')}</Link>
      </>
    );
  }
  if (reply.kind === 'directory') return <DirectoryReply query={reply.query} />;
  if (reply.kind === 'catalog')
    return <CatalogReply slug={reply.slug} query={reply.query} />;
  if (reply.kind === 'report') {
    return <><p>{t('assistant.reportSuggested')}</p><button className="velo-chat-chip" type="button" onClick={() => openReport(reply.issue)}>{t('assistant.prepareReport')}</button></>;
  }
  if (reply.kind === 'guide') {
    return (
      <>
        <p>{t(reply.guide.body)}</p>
        {reply.guide.steps?.length ? (
          <ol className="velo-chat-menu-list">
            {reply.guide.steps.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ol>
        ) : null}
        <Link to={`${paths.help}#${reply.guide.id}`}>
          {t('assistant.readGuide')}
        </Link>
      </>
    );
  }
  return (
    <>
      <p>{messageText(reply.message)}</p>
      {reply.link && <Link to={reply.link.to}>{t(reply.link.text)}</Link>}
    </>
  );
}

export function VeloAssistantChat({
  defaultOpen = false,
  scope = discovery,
}: { defaultOpen?: boolean; scope?: AssistantScope } = {}) {
  return (
    <AssistantSession
      key={scope.mode === 'store' ? `store:${scope.slug}` : scope.mode}
      defaultOpen={defaultOpen}
      scope={scope}
    />
  );
}

function AssistantSession({
  defaultOpen,
  scope,
}: {
  defaultOpen: boolean;
  scope: AssistantScope;
}) {
  const { t, messageText } = useLanguage();
  const [isOpen, setOpen] = useState(defaultOpen);
  const [input, setInput] = useState('');
  const [turns, setTurns] = useState<{ question: UiMessage; reply: Reply }[]>(
    [],
  );
  const [report, setReport] = useState<string | null>(null);
  const panelId = useId();
  const launcher = useRef<HTMLButtonElement>(null);
  const textbox = useRef<HTMLInputElement>(null);
  const reportField = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const assistantContext = useRef<string[]>([]);
  const assistantPrice = useRef<string | undefined>(undefined);
  const assistantRequest = useRef<AbortController | null>(null);
  const [isAnswering, setAnswering] = useState(false);
  const slug = scope.mode === 'store' ? scope.slug : '';
  const shop = useQuery({
    queryKey: ['storefront', slug, 'settings'],
    queryFn: ({ signal }) =>
      storefrontRequest<ShopSettings>(`/${encodeURIComponent(slug)}`, {
        signal,
      }),
    enabled: isOpen && Boolean(slug),
    retry: false,
  });
  const heading =
    scope.mode === 'merchant'
      ? t('assistant.merchantTitle')
      : scope.mode === 'store' && shop.data
        ? t('assistant.storeTitle', { name: shop.data.name })
        : scope.mode === 'store'
          ? t('assistant.storeGeneric')
          : t('assistant.discoveryTitle');

  useEffect(() => {
    if (isOpen) textbox.current?.focus({ preventScroll: true });
  }, [isOpen]);
  useEffect(() => {
    if (turns.length) end.current?.scrollIntoView?.({ block: 'nearest' });
  }, [turns.length, isAnswering]);
  useEffect(() => () => assistantRequest.current?.abort(), []);
  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };
  const submit = (text: string, question: UiMessage = text) => {
    const value = text.trim();
    if (!value || assistantRequest.current) return;
    setInput('');
    const fallback = replyFor(scope, value);
    const localOnly = fallback.kind === 'text' && typeof fallback.message !== 'string' &&
      ['assistant.privateTracking', 'assistant.noPublicQueue', 'assistant.statusAtTop'].includes(fallback.message.key);
    if (scope.mode !== 'store' || !shop.data?.assistant_enabled || localOnly) {
      setTurns((previous) => [...previous, { question, reply: fallback }]);
      return;
    }
    const controller = new AbortController();
    assistantRequest.current = controller;
    setAnswering(true);
    setTurns((previous) => [...previous, { question, reply: { kind: 'pending' } }]);
    const questions = [...assistantContext.current, value].slice(-4);
    const path = `/${encodeURIComponent(scope.slug)}/assistant`;
    void storefrontRequest<StoreAssistantAnswer>(path, {
      body: { questions, previous_price: assistantPrice.current }, signal: controller.signal,
    }).then((answer) => {
      if (controller.signal.aborted) return;
      const knownAnswer = answer && Array.isArray(answer.items) &&
        (answer.intent === 'menu' || answer.intent === 'clarify');
      const reply: Reply = knownAnswer
        ? { kind: 'assistant', slug: scope.slug, answer }
        : fallback;
      if (knownAnswer) assistantContext.current = questions;
      if (knownAnswer && answer.intent === 'menu') {
        let cheapest: bigint | null = null;
        for (const item of answer.items) {
          const amount = exactDecimal(item.unit_price);
          if (amount !== null && (cheapest === null || amount < cheapest)) {
            cheapest = amount;
            assistantPrice.current = item.unit_price;
          }
        }
      }
      setTurns((previous) => [...previous.slice(0, -1), { question, reply }]);
    }).catch(() => {
      if (!controller.signal.aborted) {
        setTurns((previous) => [...previous.slice(0, -1), { question, reply: fallback }]);
      }
    }).finally(() => {
      if (!controller.signal.aborted) {
        assistantRequest.current = null;
        setAnswering(false);
      }
    });
  };

  function openReport(issue?: TranslationKey) {
    if (scope.mode !== 'merchant') return;
    setReport(
      (current) =>
        current ??
        t('assistant.reportTemplate', {
          name: scope.organizationName,
          time: new Date().toISOString(),
          issue: issue ? t(issue) : '',
        }),
    );
    requestAnimationFrame(() => reportField.current?.focus());
  }

  return (
    <aside className="velo-assistant-root" aria-label="VELO Assistant">
      <button
        ref={launcher}
        type="button"
        className="velo-chat-launcher"
        aria-label={t('assistant.open')}
        aria-controls={isOpen ? panelId : undefined}
        aria-expanded={isOpen}
        onClick={() => {
          if (isOpen) close();
          else setOpen(true);
        }}
      >
        <MessageCircle size={28} aria-hidden="true" />
      </button>
      {isOpen && (
        <section
          id={panelId}
          className="velo-chat-window"
          role="dialog"
          aria-labelledby={`${panelId}-title`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="velo-chat-header">
            <div className="velo-chat-header-info">
              <VeloRobotAvatar />
              <div className="velo-chat-header-titles">
                <h2 id={`${panelId}-title`} className="velo-chat-title">
                  {heading}
                </h2>
                <p className="velo-chat-subtitle">
                  {scope.mode === 'store' && shop.data
                    ? t(
                        shop.data.accepting_orders
                          ? 'assistant.accepting'
                          : 'assistant.notAccepting',
                      )
                    : 'VELO Assistant'}
                </p>
              </div>
            </div>
            <button
              className="velo-chat-icon-btn"
              type="button"
              aria-label={t('assistant.close')}
              onClick={close}
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="velo-chat-body" role="log" aria-label={heading}>
            <div className="velo-chat-msg-row velo-chat-msg-bot">
              <div className="velo-chat-bubble">
                <p>{t(greetings[scope.mode])}</p>
                {shop.data?.assistant_enabled && <p>{t('assistant.menuPrivacy')}</p>}
              </div>
            </div>
            {turns.map((turn, index) => (
              <div key={index} className="velo-chat-turn">
                <div className="velo-chat-msg-row velo-chat-msg-user">
                  <div className="velo-chat-bubble">
                    <p>{messageText(turn.question)}</p>
                  </div>
                </div>
                <div className="velo-chat-msg-row velo-chat-msg-bot">
                  <div className="velo-chat-bubble">
                    <Answer reply={turn.reply} openReport={openReport} />
                  </div>
                </div>
              </div>
            ))}
            {report !== null && (
              <div className="velo-chat-report">
                <label htmlFor={`${panelId}-report`}>
                  {t('assistant.reportDraft')}
                </label>
                <p>{t('assistant.reportUnsent')}</p>
                <textarea
                  ref={reportField}
                  id={`${panelId}-report`}
                  rows={6}
                  value={report}
                  onChange={(event) => setReport(event.target.value)}
                />
                <Link to={`${paths.help}#help-support`}>
                  {t('assistant.contactOptions')}
                </Link>
              </div>
            )}
            <div ref={end} />
          </div>
          <div
            className="velo-chat-suggestions"
            role="group"
            aria-label={t('assistant.suggestions')}
          >
            {prompts[scope.mode].map((key) => (
              <button
                type="button"
                className="velo-chat-chip"
                key={key}
                disabled={isAnswering}
                onClick={() => {
                  if (key === 'assistant.reportProblem') openReport();
                  else submit(t(key), { key });
                }}
              >
                {t(key)}
              </button>
            ))}
          </div>
          <form
            className="velo-chat-footer"
            onSubmit={(event) => {
              event.preventDefault();
              submit(input);
            }}
          >
            <div className="velo-chat-input-wrapper">
              <input
                ref={textbox}
                type="text"
                maxLength={240}
                className="velo-chat-input"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={t('assistant.placeholder')}
                aria-label={t('assistant.inputLabel')}
              />
              <button
                type="submit"
                className="velo-chat-send-btn"
                disabled={!input.trim() || isAnswering}
                aria-label={t('assistant.send')}
              >
                <SendHorizontal size={16} aria-hidden="true" />
              </button>
            </div>
          </form>
        </section>
      )}
    </aside>
  );
}
