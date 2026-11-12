import { render, renderInEnglish } from '../../test/render';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';
import { useLanguage } from '../../app/language';

const mocks = vi.hoisted(() => ({
  posRequest: vi.fn(),
  orgRequest: vi.fn(),
  canUpdate: true,
}));

vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: {
      status: 'authenticated',
      session: {
        user: { id: 'user-1', display_name: 'Owner' },
        csrf_token: 'test-csrf-token',
      },
    },
  }),
}));

vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: {
      organization: {
        id: 'org-123',
        name: 'VELO Cafe & Restaurant',
        code: 'VELO-01',
        business_type: 'restaurant',
        contact_phone: '061-507-1665',
        contact_email: 'title.thirawat.dev@gmail.com',
        address: '123 ถ.สุขุมวิท ต.คลองตัน อ.คลองตัน จ.กรุงเทพฯ 26120',
      },
      membership: { role: 'OWNER' },
    },
    branchID: 'branch-1',
    can: (permission: string) =>
      permission === 'organization.update' ? mocks.canUpdate : true,
  }),
}));

vi.mock('../../lib/pos-api', () => ({
  posRequest: mocks.posRequest,
}));

vi.mock('../../lib/organization-api', () => ({
  organizationRequest: mocks.orgRequest,
}));

function LanguageSwitch() {
  const { setLanguage } = useLanguage();
  return <button onClick={() => setLanguage('th')}>Thai</button>;
}

function renderPage(props = {}, english = false) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return (english ? renderInEnglish : render)(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <SettingsPage {...props} />
        <LanguageSwitch />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('shows settings controls in English without translating stored values', () => {
  renderPage({}, true);
  expect(
    screen.getByRole('heading', { level: 1, name: 'Settings' }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/Restaurant name/)).toHaveValue(
    'VELO Cafe & Restaurant',
  );
  expect(screen.getByRole('checkbox', { name: 'Cash' })).toBeInTheDocument();
});

it('changes language without losing edited store details', () => {
  renderPage({}, true);
  fireEvent.change(screen.getByLabelText(/Restaurant name/), {
    target: { value: 'My restaurant' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Thai' }));
  expect(screen.getByLabelText(/ชื่อร้านอาหาร/)).toHaveValue('My restaurant');
  expect(screen.getByRole('option', { name: 'ร้านอาหาร' })).toBeInTheDocument();
  expect(
    screen.queryByRole('option', { name: 'ร้านอาหาร (Restaurant)' }),
  ).not.toBeInTheDocument();
});

it('formats the current business period in the selected language and time zone', () => {
  const period = { start: '2026-11-04T15:00:00Z', end: '2026-11-05T15:00:00Z' };
  renderPage({ initialSettings: { timezone: 'Asia/Bangkok', period } }, true);
  const englishStart = new Date(period.start).toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
  });
  const englishEnd = new Date(period.end).toLocaleString('en-GB', {
    timeZone: 'Asia/Bangkok',
  });
  const thaiStart = new Date(period.start).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
  });
  const thaiEnd = new Date(period.end).toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
  });
  expect(
    screen.getByText(`Current period: ${englishStart} to ${englishEnd}`),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Thai' }));
  expect(
    screen.getByText(`รอบปัจจุบัน: ${thaiStart} ถึง ${thaiEnd}`),
  ).toBeInTheDocument();
});

it('shows neutral placeholders when the business period is unavailable', () => {
  renderPage({}, true);
  expect(screen.getByText('Current period: — to —')).toBeInTheDocument();
  expect(screen.getByText('Closing time: 22:00')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Thai' }));
  expect(screen.getByText('รอบปัจจุบัน: — ถึง —')).toBeInTheDocument();
  expect(screen.getByLabelText('เวลาปิดรอบวัน')).toHaveValue('22:00');
});

beforeEach(() => {
  mocks.posRequest.mockReset();
  mocks.orgRequest.mockReset();
  mocks.canUpdate = true;
});

it.each(['hours', 'all'])(
  'updates the %s success message when switching language',
  async (section) => {
    mocks.orgRequest.mockResolvedValue({});
    mocks.posRequest.mockResolvedValue({});
    renderPage({}, true);
    fireEvent.click(
      screen.getByRole('button', {
        name: section === 'hours' ? 'Save closing time' : 'Save changes',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      section === 'hours' ? 'Closing time saved' : 'Changes saved',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thai' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      section === 'hours'
        ? 'บันทึกเวลาปิดร้านเรียบร้อยแล้ว'
        : 'บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว',
    );
  },
);

it('renders the complete settings layout matching the mockup', () => {
  renderPage();

  // Page Header
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'การตั้งค่า',
  );
  expect(screen.getByText('รายละเอียดการตั้งค่าร้านอาหาร')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'ดูหน้าร้าน' })).toHaveAttribute(
    'href',
    '/shop',
  );
  expect(
    screen.getByRole('button', { name: 'บันทึกการเปลี่ยนแปลง' }),
  ).toBeInTheDocument();

  // Card 1: ข้อมูลร้าน
  expect(screen.getByText('ข้อมูลร้าน')).toBeInTheDocument();
  expect(
    screen.getByText('ข้อมูลพื้นฐานของร้านอาหารที่แสดงในระบบ POS'),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/ชื่อร้านอาหาร/)).toHaveValue(
    'VELO Cafe & Restaurant',
  );
  expect(screen.getByLabelText(/ประเภทธุรกิจ/)).toHaveValue('restaurant');
  expect(screen.getByLabelText('โลโก้ร้าน')).toBeInTheDocument();
  expect(screen.getByLabelText(/เบอร์โทรศัพท์/)).toHaveValue('061-507-1665');
  expect(screen.getByLabelText(/อีเมล/)).toHaveValue(
    'title.thirawat.dev@gmail.com',
  );
  expect(screen.getByLabelText(/ที่อยู่ร้าน/)).toHaveValue(
    '123 ถ.สุขุมวิท ต.คลองตัน อ.คลองตัน จ.กรุงเทพฯ 26120',
  );
  expect(screen.getByLabelText(/คำอธิบายร้าน/)).toHaveValue(
    'ร้านอาหารและคาเฟ่ อาหารไทย เครื่องดื่ม และเบเกอรี่',
  );

  // Card 2: การให้บริการ
  expect(screen.getByText('การให้บริการ')).toBeInTheDocument();
  expect(
    screen.getByText('กำหนดรูปแบบการให้บริการของร้าน'),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/รูปแบบการให้บริการ/)).toHaveValue('all');

  // Card 3: เวลาทำการ
  expect(screen.getByText('เวลาทำการ')).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'เวลาปิดร้านและรอบวัน' }),
  ).toBeInTheDocument();
  expect(screen.getByText(/ไม่ล้างสต็อก/)).toBeInTheDocument();
  expect(screen.getByLabelText('เวลาปิดรอบวัน')).toHaveValue('22:00');
  expect(
    screen.getByRole('button', { name: 'แก้ไขเวลาเปิดร้าน' }),
  ).toBeInTheDocument();

  // Card 4: การชำระเงิน
  expect(screen.getByText('การชำระเงิน')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'เงินสด' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(
    screen.getByRole('checkbox', { name: 'บัตรเครดิต/เดบิต' }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(
    screen.getByRole('checkbox', { name: 'QR พร้อมเพย์' }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('checkbox', { name: 'E-Wallet' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  expect(screen.getByRole('checkbox', { name: 'อื่น ๆ' })).toHaveAttribute(
    'aria-checked',
    'false',
  );

  // Card 5: การใช้งานโต๊ะและ QR
  expect(screen.getByText('การใช้งานโต๊ะและ QR')).toBeInTheDocument();
  expect(
    screen.getByRole('checkbox', { name: 'ใช้งานโต๊ะในร้าน' }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(
    screen.getByRole('checkbox', { name: 'ใช้งาน QR สั่งอาหาร' }),
  ).toHaveAttribute('aria-checked', 'true');

  // Card 6: อุปกรณ์ POS
  expect(screen.getByText('อุปกรณ์ POS')).toBeInTheDocument();
  expect(
    screen.getByText('ตั้งค่าอุปกรณ์ที่ใช้งานร่วมกับระบบ POS'),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/เครื่อง POS \/ เครื่องขาย/)).toHaveValue(
    'DEMO-POS-01',
  );
  expect(screen.getByLabelText(/เครื่องพิมพ์ใบเสร็จ/)).toHaveValue(
    'use_connected',
  );
});

it('allows editing form fields and toggling options', () => {
  renderPage();

  // Online store settings are managed on their own page.
  expect(
    screen.getByRole('link', { name: 'ไปยังหน้าตั้งค่าหน้าร้านออนไลน์' }),
  ).toHaveAttribute('href', '/settings/storefront');

  // Change name and phone
  const nameInput = screen.getByLabelText(/ชื่อร้านอาหาร/);
  fireEvent.change(nameInput, { target: { value: 'New Cafe' } });
  expect(nameInput).toHaveValue('New Cafe');

  // Toggle payment method
  const ewallet = screen.getByRole('checkbox', { name: 'E-Wallet' });
  expect(ewallet).toHaveAttribute('aria-checked', 'false');
  fireEvent.click(ewallet);
  expect(ewallet).toHaveAttribute('aria-checked', 'true');

  // Toggle table option
  const tableToggle = screen.getByRole('checkbox', {
    name: 'ใช้งานโต๊ะในร้าน',
  });
  expect(tableToggle).toHaveAttribute('aria-checked', 'true');
  fireEvent.click(tableToggle);
  expect(tableToggle).toHaveAttribute('aria-checked', 'false');
});

it('submits closing time when onSaveHours is provided', () => {
  const onSaveHours = vi.fn();
  renderPage({ onSaveHours });

  const input = screen.getByLabelText('เวลาปิดรอบวัน');
  fireEvent.change(input, { target: { value: '23:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'บันทึกเวลาปิดร้าน' }));

  expect(onSaveHours).toHaveBeenCalledWith('23:00');
});

it('saves all settings when clicking "บันทึกการเปลี่ยนแปลง"', async () => {
  mocks.orgRequest.mockResolvedValue({});
  mocks.posRequest.mockResolvedValue({});
  renderPage();

  const saveBtn = screen.getByRole('button', {
    name: 'บันทึกการเปลี่ยนแปลง',
  });
  fireEvent.click(saveBtn);

  await waitFor(() => {
    expect(mocks.orgRequest).toHaveBeenCalledWith(
      '/organizations/org-123',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.objectContaining({
          name: 'VELO Cafe & Restaurant',
          contact_phone: '061-507-1665',
        }),
      }),
    );
  });

  expect(
    await screen.findByText('บันทึกการเปลี่ยนแปลงเรียบร้อยแล้ว'),
  ).toBeInTheDocument();
});

it('links the storefront button to the store website using active slug', async () => {
  mocks.posRequest.mockImplementation((_org: string, path: string) => {
    if (path === '/storefront') {
      return Promise.resolve({ slug: 'velocafe', name: 'VELO Cafe' });
    }
    return Promise.resolve({});
  });
  renderPage();

  const link = await screen.findByRole('link', { name: 'ดูหน้าร้าน' });
  expect(link).toHaveAttribute('href', '/shop/velocafe');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noreferrer');
});

it('shows the storefront button in English linking to the store website', async () => {
  renderPage({ initialStorefront: { slug: 'my-shop' } }, true);

  const link = screen.getByRole('link', { name: 'View storefront' });
  expect(link).toHaveAttribute('href', '/shop/my-shop');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noreferrer');
});
