import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LanguageProvider, useLanguage } from '../../app/language';
import { HelpPage } from './HelpPage';

function HelpHarness() {
  const { setLanguage } = useLanguage();
  return (
    <>
      <button onClick={() => setLanguage('en')}>English</button>
      <button onClick={() => setLanguage('th')}>Thai</button>
      <HelpPage />
    </>
  );
}

describe('store help', () => {
  it('shows store guidance, switches language and excludes developer instructions', () => {
    localStorage.setItem('smartpos.language', 'th');
    const { container } = render(
      <LanguageProvider>
        <HelpHarness />
      </LanguageProvider>,
    );
    expect(
      screen.getByRole('heading', { name: 'คู่มือใช้งานร้าน' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(
      screen.getByRole('heading', { name: 'Store help' }),
    ).toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /npm|localhost|Docker|developer|repository|[\u0e01-\u0e3a\u0e40-\u0e5b]/i,
    );
  });

  it('filters guides and FAQs when searching, and resets on clear', () => {
    localStorage.setItem('smartpos.language', 'th');
    render(
      <LanguageProvider>
        <HelpHarness />
      </LanguageProvider>,
    );

    const searchInput = screen.getByRole('searchbox');
    expect(searchInput).toBeInTheDocument();

    // Type "เปิดกะ"
    fireEvent.change(searchInput, { target: { value: 'เปิดกะ' } });
    expect(
      screen.getByRole('heading', {
        name: 'การเปิดกะขายและการคิดเงินหน้าร้าน',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'เตรียมร้านให้พร้อม' }),
    ).not.toBeInTheDocument();

    // Clear search
    const clearBtn = screen.getByLabelText('ล้างการค้นหา');
    fireEvent.click(clearBtn);
    expect(searchInput).toHaveValue('');
    expect(
      screen.getByRole('heading', { name: 'เตรียมร้านให้พร้อม' }),
    ).toBeInTheDocument();
  });

  it('filters by category tabs properly', () => {
    localStorage.setItem('smartpos.language', 'th');
    render(
      <LanguageProvider>
        <HelpHarness />
      </LanguageProvider>,
    );

    // Click "คิวครัว" category tab
    const kitchenTab = screen.getByRole('tab', { name: 'คิวครัว' });
    fireEvent.click(kitchenTab);
    expect(kitchenTab).toHaveAttribute('aria-selected', 'true');

    // Kitchen guide should be visible, POS guide should be hidden
    expect(
      screen.getByRole('heading', { name: 'รับออเดอร์และส่งงานเข้าครัว' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', {
        name: 'การเปิดกะขายและการคิดเงินหน้าร้าน',
      }),
    ).not.toBeInTheDocument();

    // Switch back to "ทั้งหมด"
    fireEvent.click(screen.getByRole('tab', { name: 'ทั้งหมด' }));
    expect(
      screen.getByRole('heading', {
        name: 'การเปิดกะขายและการคิดเงินหน้าร้าน',
      }),
    ).toBeInTheDocument();
  });

  it('toggles FAQ accordion questions open and closed', () => {
    localStorage.setItem('smartpos.language', 'th');
    render(
      <LanguageProvider>
        <HelpHarness />
      </LanguageProvider>,
    );

    const questionTrigger = screen.getByRole('button', {
      name: /ทำไมออเดอร์ใหม่ถึงไม่ปรากฏในหน้าคิวครัว/i,
    });
    expect(questionTrigger).toHaveAttribute('aria-expanded', 'false');

    // Click to open
    fireEvent.click(questionTrigger);
    expect(questionTrigger).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByText(/ระบบครัวจะแสดงเฉพาะออเดอร์ที่ได้รับการชำระเงินแล้ว/i),
    ).toBeInTheDocument();

    // Click to close
    fireEvent.click(questionTrigger);
    expect(questionTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('provides quick action shortcuts to major operational pages', () => {
    localStorage.setItem('smartpos.language', 'th');
    render(
      <LanguageProvider>
        <HelpHarness />
      </LanguageProvider>,
    );

    expect(
      screen.getByRole('link', { name: /แคชเชียร์ POS/i }),
    ).toHaveAttribute('href', '/pos');
    expect(screen.getByRole('link', { name: /คิวครัว/i })).toHaveAttribute(
      'href',
      '/kitchen',
    );
    expect(screen.getByRole('link', { name: /เมนูอาหาร/i })).toHaveAttribute(
      'href',
      '/menu',
    );
    expect(
      screen.getByRole('link', { name: /ตั้งค่าร้านค้า/i }),
    ).toHaveAttribute('href', '/settings');
  });
});
