import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider, useLanguage } from './language';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';

function Page() {
  const { t } = useLanguage();
  return (
    <>
      <LanguageSwitcher />
      <h1>{t('common.save')}</h1>
      <label htmlFor="draft">Draft</label>
      <input id="draft" />
    </>
  );
}

beforeEach(() => localStorage.clear());

describe('shared language preference', () => {
  it('updates an interpolated message while preserving its original data', () => {
    function Message() {
      const { messageText } = useLanguage();
      return (
        <p role="status">
          {messageText({
            key: 'storefront.addedValue0ToCart',
            params: { value0: 'SKU-001' },
          })}
        </p>
      );
    }
    render(
      <LanguageProvider>
        <LanguageSwitcher />
        <Message />
      </LanguageProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'เพิ่ม SKU-001 ลงตะกร้าแล้ว',
    );
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Added SKU-001 to cart',
    );
  });

  it('starts in Thai, switches immediately, retains input, and restores the preference', () => {
    const first = render(
      <LanguageProvider>
        <Page />
      </LanguageProvider>,
    );
    expect(screen.getByRole('heading', { name: 'บันทึก' })).toBeVisible();
    expect(document.documentElement.lang).toBe('th');
    fireEvent.change(screen.getByLabelText('Draft'), {
      target: { value: 'สินค้า A' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { name: 'Save' })).toBeVisible();
    expect(screen.getByLabelText('Draft')).toHaveValue('สินค้า A');
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(document.documentElement.lang).toBe('en');
    first.unmount();
    render(
      <LanguageProvider>
        <Page />
      </LanguageProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Save' })).toBeVisible();
  });

  it('falls back to Thai for an unsupported stored preference', () => {
    localStorage.setItem('smartpos.language', 'fr');
    render(
      <LanguageProvider>
        <Page />
      </LanguageProvider>,
    );
    expect(screen.getByRole('heading', { name: 'บันทึก' })).toBeVisible();
  });

  it('keeps switching available when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Blocked');
    });
    render(
      <LanguageProvider>
        <Page />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { name: 'Save' })).toBeVisible();
    vi.restoreAllMocks();
  });
});
