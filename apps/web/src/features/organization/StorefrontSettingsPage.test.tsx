import { render } from '../../test/render';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { StorefrontSettingsPage, THEME_COLORS } from './StorefrontSettingsPage';

vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: {
      organization: {
        id: 'org-123',
        name: 'VELO Cafe & Restaurant',
        code: 'VELO-01',
        business_type: 'restaurant',
      },
      membership: { role: 'OWNER' },
    },
    branchID: 'branch-1',
    can: () => true,
  }),
}));

function renderPage(props = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <StorefrontSettingsPage {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('renders the complete storefront settings layout matching the mockup', () => {
  renderPage();

  // Header
  expect(
    screen.getByRole('heading', { level: 1, name: 'หน้าร้านออนไลน์' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      'ตั้งค่าหน้าร้านสำหรับรับออเดอร์ออนไลน์ (ซื้อกลับบ้าน / เดลิเวอรี)',
    ),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('link', { name: 'กลับไปการตั้งค่า' }),
  ).toHaveAttribute('href', '/settings');
  expect(
    screen.getByRole('button', { name: 'บันทึกการตั้งค่า' }),
  ).toBeInTheDocument();

  // Card 1: เปิดใช้งานหน้าร้านออนไลน์
  expect(
    screen.getByRole('heading', { name: 'เปิดใช้งานหน้าร้านออนไลน์' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('ให้ลูกค้าสั่งอาหารผ่านลิงก์ของร้านได้'),
  ).toBeInTheDocument();
  const toggle = screen.getByRole('switch', {
    name: 'เปิดใช้งานหน้าร้านออนไลน์',
  });
  expect(toggle).toHaveAttribute('aria-checked', 'true');

  // Card 2: รายละเอียดหน้าร้านออนไลน์
  expect(
    screen.getByRole('heading', { name: 'รายละเอียดหน้าร้านออนไลน์' }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText(/ชื่อหน้าร้าน \(แสดงบนเว็บ\)/)).toHaveValue(
    'VELO Cafe & Restaurant',
  );
  expect(screen.getByLabelText(/ลิงก์หน้าร้าน \(URL\)/)).toHaveValue(
    'velocafe',
  );
  expect(screen.getByText('.velopos.com')).toBeInTheDocument();
  const description = 'ร้านอาหารและคาเฟ่ อาหารไทย เครื่องดื่ม และเบเกอรี่';
  expect(screen.getByLabelText(/คำอธิบายร้าน/)).toHaveValue(description);
  expect(screen.getByText(`${description.length} / 200`)).toBeInTheDocument();

  // Card 3: ช่องทางรับออเดอร์
  expect(
    screen.getByRole('heading', { name: 'ช่องทางรับออเดอร์' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('checkbox', { name: /ซื้อกลับบ้าน/ }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByRole('checkbox', { name: /เดลิเวอรี/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect(screen.getByRole('checkbox', { name: /ทานที่ร้าน/ })).toHaveAttribute(
    'aria-checked',
    'false',
  );

  // Card 4: การแสดงผลหน้าร้าน
  expect(
    screen.getByRole('heading', { name: 'การแสดงผลหน้าร้าน' }),
  ).toBeInTheDocument();
  expect(screen.getByText('สีธีมหน้าร้าน')).toBeInTheDocument();
  THEME_COLORS.forEach((color) => {
    expect(
      screen.getByRole('button', { name: color.label }),
    ).toBeInTheDocument();
  });
  expect(screen.getByRole('button', { name: 'สีเหลือง' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByAltText('พรีวิวโลโก้หรือภาพหน้าปก')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'อัปโหลดภาพ' }),
  ).toBeInTheDocument();

  // Card 5: เวลารับออเดอร์ออนไลน์
  expect(
    screen.getByRole('heading', { name: 'เวลารับออเดอร์ออนไลน์' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('radio', { name: /ตามเวลาเปิด-ปิดร้าน/ }),
  ).toHaveAttribute('aria-checked', 'true');
  expect(
    screen.getByRole('radio', { name: /กำหนดแยกสำหรับออนไลน์/ }),
  ).toHaveAttribute('aria-checked', 'false');

  // Card 6: ลิงก์และ QR
  expect(
    screen.getByRole('heading', { name: 'ลิงก์และ QR' }),
  ).toBeInTheDocument();
  expect(screen.getByText('https://velocafe.velopos.com')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'คัดลอกลิงก์' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { name: 'QR หน้าร้านออนไลน์' }),
  ).toBeInTheDocument();
  expect(screen.getByText('ให้ลูกค้าสแกนเพื่อสั่งอาหาร')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'ดาวน์โหลด' })).toBeInTheDocument();
});

it('toggles the storefront enable switch', () => {
  renderPage();
  const toggle = screen.getByRole('switch', {
    name: 'เปิดใช้งานหน้าร้านออนไลน์',
  });
  expect(toggle).toHaveAttribute('aria-checked', 'true');

  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-checked', 'false');

  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-checked', 'true');
});

it('updates form fields and live URL reflection', () => {
  renderPage();
  const nameInput = screen.getByLabelText(/ชื่อหน้าร้าน \(แสดงบนเว็บ\)/);
  const slugInput = screen.getByLabelText(/ลิงก์หน้าร้าน \(URL\)/);
  const descInput = screen.getByLabelText(/คำอธิบายร้าน/);

  fireEvent.change(nameInput, { target: { value: 'My New Cafe' } });
  expect(nameInput).toHaveValue('My New Cafe');

  fireEvent.change(slugInput, { target: { value: 'mynewcafe' } });
  expect(slugInput).toHaveValue('mynewcafe');
  // Check live reflection in Link display
  expect(screen.getByText('https://mynewcafe.velopos.com')).toBeInTheDocument();

  fireEvent.change(descInput, { target: { value: 'Hello world' } });
  expect(descInput).toHaveValue('Hello world');
  expect(screen.getByText('11 / 200')).toBeInTheDocument();
});

it('toggles order channels independently', () => {
  renderPage();
  const takeawayChip = screen.getByRole('checkbox', {
    name: /ซื้อกลับบ้าน/,
  });
  const dineInChip = screen.getByRole('checkbox', {
    name: /ทานที่ร้าน/,
  });

  expect(takeawayChip).toHaveAttribute('aria-checked', 'true');
  expect(dineInChip).toHaveAttribute('aria-checked', 'false');

  fireEvent.click(takeawayChip);
  expect(takeawayChip).toHaveAttribute('aria-checked', 'false');

  fireEvent.click(dineInChip);
  expect(dineInChip).toHaveAttribute('aria-checked', 'true');
});

it('selects theme colors', () => {
  renderPage();
  const yellowBtn = screen.getByRole('button', { name: 'สีเหลือง' });
  const blueBtn = screen.getByRole('button', { name: 'สีน้ำเงิน' });

  expect(yellowBtn).toHaveAttribute('aria-pressed', 'true');
  expect(blueBtn).toHaveAttribute('aria-pressed', 'false');

  fireEvent.click(blueBtn);
  expect(yellowBtn).toHaveAttribute('aria-pressed', 'false');
  expect(blueBtn).toHaveAttribute('aria-pressed', 'true');
});

it('switches online order hours mode', () => {
  renderPage();
  const storeHoursRadio = screen.getByRole('radio', {
    name: /ตามเวลาเปิด-ปิดร้าน/,
  });
  const customOnlineRadio = screen.getByRole('radio', {
    name: /กำหนดแยกสำหรับออนไลน์/,
  });

  expect(storeHoursRadio).toHaveAttribute('aria-checked', 'true');
  expect(customOnlineRadio).toHaveAttribute('aria-checked', 'false');

  fireEvent.click(customOnlineRadio);
  expect(storeHoursRadio).toHaveAttribute('aria-checked', 'false');
  expect(customOnlineRadio).toHaveAttribute('aria-checked', 'true');
});

it('handles copy link action', async () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, {
    clipboard: { writeText: writeTextMock },
  });

  renderPage();
  const copyBtn = screen.getByRole('button', { name: 'คัดลอกลิงก์' });
  fireEvent.click(copyBtn);

  expect(writeTextMock).toHaveBeenCalledWith('https://velocafe.velopos.com');
  await waitFor(() => {
    expect(
      screen.getByRole('button', { name: 'คัดลอกแล้ว' }),
    ).toBeInTheDocument();
  });
});

it('submits form and calls onSave with updated config', async () => {
  const onSave = vi.fn().mockResolvedValue(undefined);
  renderPage({ onSave });

  const saveBtn = screen.getByRole('button', { name: 'บันทึกการตั้งค่า' });
  fireEvent.click(saveBtn);

  await waitFor(() => {
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        isEnabled: true,
        name: 'VELO Cafe & Restaurant',
        slug: 'velocafe',
        channels: { takeaway: true, delivery: true, dineIn: false },
        themeColor: 'yellow',
        hoursMode: 'store_hours',
      }),
    );
    expect(
      screen.getByText('บันทึกการตั้งค่าหน้าร้านออนไลน์สำเร็จ'),
    ).toBeInTheDocument();
  });
});
