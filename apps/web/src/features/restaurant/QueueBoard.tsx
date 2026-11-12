import { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Clock,
  CookingPot,
  Info,
  Maximize2,
  Minimize2,
  ShoppingBag,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { QueueItem } from './RestaurantPage';
import './queue-board.css';

interface QueueBoardProps {
  items: QueueItem[];
  storeName?: string;
  onRefresh?: () => void;
  isFetching?: boolean;
}

export function QueueBoard({
  items,
  storeName = 'VELO Shop',
}: QueueBoardProps) {
  const [fullscreen, setFullscreen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const prevReadyIdsRef = useRef<Set<string>>(new Set());

  // Clock ticker every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter queues
  const preparing = items.filter(
    (item) => item.status === 'PREPARING' || item.status === 'PENDING',
  );
  const ready = items.filter((item) => item.status === 'READY');

  // Audio chime when a new queue enters READY
  useEffect(() => {
    const currentReadyIds = new Set(ready.map((r) => r.order_id));
    let hasNewReady = false;
    for (const id of currentReadyIds) {
      if (!prevReadyIdsRef.current.has(id)) {
        hasNewReady = true;
        break;
      }
    }
    prevReadyIdsRef.current = currentReadyIds;

    if (hasNewReady && soundEnabled) {
      playChime();
    }
  }, [ready, soundEnabled]);

  // Fullscreen toggle handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().then(() => {
        setFullscreen(true);
      });
    } else {
      void document.exitFullscreen().then(() => {
        setFullscreen(false);
      });
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () =>
      document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Format date in Thai format: พ. 5 พ.ย. 2026
  const thaiDate = formatThaiDate(currentTime);
  const thaiTime = formatThaiTime(currentTime);

  const displayPreparing = preparing.slice(0, 11);
  const overflowPreparing = preparing.length - 11;

  const displayReady = ready.slice(0, 12);

  return (
    <div
      className={`queue-board-container ${fullscreen ? 'is-fullscreen' : ''}`}
    >
      {/* Top Header */}
      <header className="queue-board-header">
        <div className="queue-board-brand">
          <div className="queue-board-logo-badge">
            <ShoppingBag size={24} />
          </div>
          <div className="queue-board-title-group">
            <h1>{storeName}</h1>
            <p>หน้าจอคิวรับอาหาร ติดตามสถานะคำสั่งซื้อของคุณ</p>
          </div>
        </div>

        <div className="queue-board-clock-group">
          <div className="queue-board-date-pill">
            <Calendar size={18} />
            <span>{thaiDate}</span>
          </div>
          <div className="queue-board-time-pill">
            <Clock size={18} />
            <span>{thaiTime}</span>
          </div>

          <div className="queue-board-controls">
            <button
              type="button"
              className="queue-board-ctrl-btn"
              onClick={() => setSoundEnabled(!soundEnabled)}
              title={soundEnabled ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'}
              aria-label={
                soundEnabled ? 'ปิดเสียงแจ้งเตือน' : 'เปิดเสียงแจ้งเตือน'
              }
            >
              {soundEnabled ? <Volume2 size={19} /> : <VolumeX size={19} />}
            </button>
            <button
              type="button"
              className="queue-board-ctrl-btn"
              onClick={toggleFullscreen}
              title={fullscreen ? 'ออกจากเต็มจอ' : 'แสดงเต็มจอ TV'}
              aria-label={fullscreen ? 'ออกจากเต็มจอ' : 'แสดงเต็มจอ TV'}
            >
              {fullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
            </button>
          </div>
        </div>
      </header>

      {/* Dual Columns */}
      <main className="queue-board-columns">
        {/* Left Column: กำลังเตรียมอาหาร */}
        <section
          className="queue-column-card preparing"
          aria-label="คิวกำลังเตรียมอาหาร"
        >
          <div className="queue-column-header">
            <div className="queue-column-title-wrap">
              <CookingPot size={28} />
              <h2>กำลังเตรียมอาหาร</h2>
            </div>
            <span className="queue-column-count-badge">
              {preparing.length} คิว
            </span>
          </div>

          <div className="queue-column-grid">
            {preparing.length === 0 ? (
              <div className="queue-empty-text">ไม่มีออเดอร์ที่กำลังเตรียม</div>
            ) : (
              <>
                {displayPreparing.map((item) => (
                  <div key={item.order_id} className="queue-ticket-card">
                    {formatQueueNum(item.queue_number)}
                  </div>
                ))}
                {overflowPreparing > 0 && (
                  <div className="queue-overflow-card">
                    + {overflowPreparing} ออเดอร์
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* Right Column: พร้อมรับอาหาร */}
        <section
          className="queue-column-card ready"
          aria-label="คิวพร้อมรับอาหาร"
        >
          <div className="queue-column-header">
            <div className="queue-column-title-wrap">
              <ShoppingBag size={28} />
              <h2>พร้อมรับอาหาร</h2>
            </div>
            <span className="queue-column-count-badge">{ready.length} คิว</span>
          </div>

          <div className="queue-column-grid">
            {ready.length === 0 ? (
              <div className="queue-empty-text">
                ไม่มีออเดอร์ที่พร้อมรับในขณะนี้
              </div>
            ) : (
              displayReady.map((item) => (
                <div key={item.order_id} className="queue-ticket-card">
                  {formatQueueNum(item.queue_number)}
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Bottom Footer */}
      <footer className="queue-board-footer">
        <div className="queue-footer-steps">
          <span className="queue-footer-steps-title">
            <Info size={19} />
            ขั้นตอนการสั่งอาหาร
          </span>
          <span className="queue-step-item">🛒 สั่งอาหาร</span>
          <span>&gt;</span>
          <span className="queue-step-item">💳 ชำระเงิน</span>
          <span>&gt;</span>
          <span className="queue-step-item">🍲 กำลังเตรียม</span>
          <span>&gt;</span>
          <span className="queue-step-item highlight">🛍️ พร้อมรับ</span>
        </div>

        <div className="queue-footer-notice">
          <Volume2 size={20} color="#DC2626" />
          <span>กรุณารับอาหาร เมื่อหมายเลขของคุณปรากฏในฝั่งขวา</span>
        </div>
      </footer>
    </div>
  );
}

function formatQueueNum(num: string | undefined): string {
  if (!num) return '#---';
  const clean = num.replace(/^#/, '');
  return `#${clean.padStart(3, '0')}`;
}

const THAI_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

const THAI_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

function formatThaiDate(d: Date): string {
  const dayName = THAI_DAYS[d.getDay()];
  const dateNum = d.getDate();
  const monthName = THAI_MONTHS[d.getMonth()];
  const yearBE = d.getFullYear() + 543;
  return `${dayName} ${dateNum} ${monthName} ${yearBE}`;
}

function formatThaiTime(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m} น.`;
}

function playChime() {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // Tone 1: 587.33 Hz (D5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.value = 587.33;
    gain1.gain.setValueAtTime(0.3, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.35);

    // Tone 2: 880 Hz (A5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = 880;
    gain2.gain.setValueAtTime(0.35, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.6);
  } catch {
    // Ignore audio permission or context creation errors
  }
}
