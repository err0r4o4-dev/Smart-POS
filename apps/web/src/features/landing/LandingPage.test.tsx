import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { LandingPage } from './LandingPage';

const mocks = vi.hoisted(() => ({ status: 'anonymous' }));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({ state: { status: mocks.status } }),
}));
beforeEach(() => {
  mocks.status = 'anonymous';
});
function renderLanding() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>,
  );
}

it('shows landing sections and real destinations without the management sidebar', () => {
  renderLanding();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'จัดการร้านให้ง่ายขายได้อย่างมั่นใจ',
  );
  expect(screen.getByRole('link', { name: 'เริ่มต้นใช้งาน' })).toHaveAttribute(
    'href',
    '/register',
  );
  expect(screen.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveAttribute(
    'href',
    '/login',
  );
  expect(screen.getByRole('link', { name: 'ดูวิธีใช้งาน' })).toHaveAttribute(
    'href',
    '#how-it-works',
  );
  expect(screen.getByRole('link', { name: 'คู่มือการใช้งาน' })).toHaveAttribute(
    'href',
    '/help',
  );
  expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(6);
  expect(screen.getByRole('link', { name: 'หน้าร้านออนไลน์' })).toHaveAttribute(
    'href',
    '/shop',
  );
  expect(
    screen.queryByRole('heading', { name: 'เลือกทางเข้าที่ตรงกับคุณ' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('คนละหน้าที่ คนละพื้นที่')).not.toBeInTheDocument();
  expect(document.querySelector('.landing-access')).not.toBeInTheDocument();
  expect(
    document.querySelector('.landing-access-grid'),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText('ภาพตัวอย่างประกอบระบบ POS ไม่ใช่ข้อมูลการขายจริง'),
  ).toBeVisible();
  expect(
    screen.queryByRole('navigation', { name: 'Main navigation' }),
  ).not.toBeInTheDocument();
  expect(document.querySelector('#how-it-works')).toBeInTheDocument();
  expect(document.querySelector('#landing-main')).toHaveAttribute(
    'tabindex',
    '-1',
  );
});
it('resolves the real role instead of treating every signed-in user as an owner', () => {
  mocks.status = 'authenticated';
  renderLanding();
  const workspaceLinks = screen.getAllByRole('link', {
    name: 'เข้าสู่พื้นที่ทำงาน',
  });
  expect(workspaceLinks).toHaveLength(2);
  for (const link of workspaceLinks)
    expect(link).toHaveAttribute('href', '/workspace');
  expect(
    screen.queryByRole('link', { name: 'เริ่มต้นใช้งาน' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'เข้าสู่ระบบ' }),
  ).not.toBeInTheDocument();
});
it('keeps session actions disabled while checking authentication', () => {
  mocks.status = 'loading';
  renderLanding();
  const pendingActions = screen.getAllByRole('button', {
    name: 'กำลังตรวจสอบ…',
  });
  expect(pendingActions).toHaveLength(2);
  for (const action of pendingActions) expect(action).toBeDisabled();
  expect(screen.getByRole('link', { name: 'ดูวิธีใช้งาน' })).toBeVisible();
  expect(document.querySelector('a[href="/register"]')).not.toBeInTheDocument();
});
it('keeps public content and sign-in available after a session lookup error', () => {
  mocks.status = 'error';
  renderLanding();
  expect(screen.getByRole('heading', { level: 1 })).toBeVisible();
  expect(screen.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveAttribute(
    'href',
    '/login',
  );
});
