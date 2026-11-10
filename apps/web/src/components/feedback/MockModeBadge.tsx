import { useState } from 'react';
import {
  Sparkles,
  RotateCcw,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  X,
  Layers,
} from 'lucide-react';
import {
  isMockEnabled,
  setMockEnabled,
  resetMockState,
} from '../../mocks/mock-service';

export function MockModeBadge() {
  const enabled = isMockEnabled();
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Show badge in development mode or whenever mock is active
  if (!import.meta.env.DEV && !enabled) {
    return null;
  }

  const handleReset = () => {
    resetMockState();
    setResetting(true);
    setTimeout(() => {
      setResetting(false);
      window.location.reload();
    }, 400);
  };

  const navLinks = [
    { label: 'หน้าร้านขาย POS', path: '/pos' },
    { label: 'คิวทำอาหารในครัว (KDS)', path: '/restaurant/queue' },
    { label: 'ออเดอร์ออนไลน์', path: '/online-orders' },
    { label: 'ประวัติการขาย', path: '/sales' },
    { label: 'ใบเสร็จรับเงิน', path: '/receipts' },
    { label: 'การขอคืนเงิน', path: '/sales/refunds' },
    { label: 'จัดการสินค้า & เมนู', path: '/products' },
    { label: 'หมวดหมู่สินค้า', path: '/categories' },
    { label: 'หน่วยนับสินค้า', path: '/units' },
    { label: 'ตั้งค่าร้านค้า & โต๊ะ', path: '/settings' },
    { label: 'หน้าเว็บสั่งอาหารลูกค้า', path: '/shop/main-store' },
    { label: 'ตัวช่วยตั้งค่าร้านใหม่', path: '/setup' },
  ];

  return (
    <aside
      aria-label="Mock Mode Developer Toolbar"
      style={{
        position: 'fixed',
        bottom: '16px',
        right: '16px',
        zIndex: 99999,
        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
        fontSize: '13px',
      }}
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            borderRadius: '9999px',
            border: enabled
              ? '1px solid rgba(229, 169, 59, 0.5)'
              : '1px solid rgba(0, 0, 0, 0.15)',
            background: enabled
              ? 'linear-gradient(135deg, #fff9e6 0%, #fff 100%)'
              : '#ffffff',
            color: enabled ? '#946300' : '#4b5563',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
            cursor: 'pointer',
            fontWeight: 600,
            transition: 'all 0.2s ease',
          }}
          title="คลิกเพื่อเปิดเครื่องมือจำลองข้อมูล Mock Mode"
        >
          <Sparkles size={16} color={enabled ? '#d97706' : '#9ca3af'} />
          <span>Mock State: {enabled ? 'ON' : 'OFF'}</span>
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: enabled ? '#10b981' : '#9ca3af',
              boxShadow: enabled ? '0 0 6px #10b981' : 'none',
            }}
          />
          <ChevronUp size={14} />
        </button>
      ) : (
        <div
          style={{
            width: '320px',
            maxWidth: 'calc(100vw - 32px)',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: '1px solid rgba(0, 0, 0, 0.1)',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.18)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)',
              borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Layers size={18} color="#b45309" />
              <div>
                <strong style={{ display: 'block', color: '#92400e', fontSize: '13px' }}>
                  SmartPOS UI Mock
                </strong>
                <span style={{ fontSize: '11px', color: '#b45309' }}>
                  ดู UI ได้ครบทุกหน้า ไม่ต้องเปิด Docker
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
                color: '#78350f',
              }}
              title="ปิดเมนู"
            >
              <X size={16} />
            </button>
          </div>

          {/* Controls */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #f3f4f6' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
              }}
            >
              <span style={{ fontWeight: 500, color: '#374151' }}>สถานะการจำลองข้อมูล</span>
              <button
                type="button"
                onClick={() => setMockEnabled(!enabled)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '20px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  backgroundColor: enabled ? '#dcfce7' : '#f3f4f6',
                  color: enabled ? '#15803d' : '#6b7280',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'background 0.2s ease',
                }}
              >
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    backgroundColor: enabled ? '#22c55e' : '#9ca3af',
                  }}
                />
                {enabled ? 'เปิดใช้งานอยู่ (ON)' : 'ปิดใช้งาน (OFF)'}
              </button>
            </div>

            {enabled && (
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                style={{
                  width: '100%',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  backgroundColor: '#f9fafb',
                  color: '#4b5563',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                }}
              >
                <RotateCcw size={13} />
                <span>{resetting ? 'กำลังรีเซ็ต...' : 'รีเซ็ตข้อมูลจำลองเป็นค่าเริ่มต้น'}</span>
              </button>
            )}
          </div>

          {/* Quick Page Links */}
          <div style={{ padding: '12px 16px', maxHeight: '220px', overflowY: 'auto' }}>
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#9ca3af',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: '8px',
              }}
            >
              ทางลัดดูหน้าจอต่างๆ (Quick Preview)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {navLinks.map((link) => (
                <a
                  key={link.path}
                  href={link.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    color: '#374151',
                    textDecoration: 'none',
                    fontSize: '12px',
                    transition: 'background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span>{link.label}</span>
                  <ExternalLink size={12} color="#9ca3af" />
                </a>
              ))}
            </div>
          </div>

          {/* Footer toggle */}
          <div
            style={{
              padding: '8px 16px',
              background: '#f9fafb',
              borderTop: '1px solid #f3f4f6',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#6b7280',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <ChevronDown size={12} />
              <span>ย่อแถบเครื่องมือ</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}