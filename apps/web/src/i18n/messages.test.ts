import { describe, expect, it } from 'vitest';
import { messages, translate, localize, errorMessage } from './index';
import { navigation } from '../app/routes';

function flatten(value: object, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entry]) => {
      const name = prefix ? `${prefix}.${key}` : key;
      return typeof entry === 'string'
        ? [[name, entry]]
        : Object.entries(flatten(entry, name));
    }),
  );
}

describe('translation coverage', () => {
  it('translates every management navigation label without changing its route', () => {
    for (const item of navigation) {
      expect(localize('en', item.label), item.to).not.toMatch(
        /[\u0e01-\u0e3a\u0e40-\u0e5b]/,
      );
      expect(localize('th', item.label), item.to).toBe(item.label);
    }
  });
  it('localizes known errors and preserves unknown server recovery guidance', () => {
    expect(errorMessage('en', new Error('ข้อมูลสถานะชำระเงินไม่ถูกต้อง'))).toBe(
      'Could not verify payment status. Check the order status before trying again.',
    );
    expect(errorMessage('en', new Error('เกิดปัญหาภายในที่ไม่รู้จัก'))).toBe(
      'เกิดปัญหาภายในที่ไม่รู้จัก',
    );
    expect(
      errorMessage(
        'th',
        new Error('Order changed. Reload it before retrying payment.'),
      ),
    ).toBe('Order changed. Reload it before retrying payment.');
    expect(errorMessage('en', { status: 409 })).toContain(
      'Check the latest status',
    );
    expect(errorMessage('en', { status: 403 })).toContain('permission');
  });
  it('renders a complete option-removal sentence in either language', () => {
    expect(translate('th', 'catalog.removeVariant', { number: 2 })).toBe(
      'นำตัวเลือกที่ 2 ออก',
    );
    expect(translate('en', 'catalog.removeVariant', { number: 2 })).toBe(
      'Remove option 2',
    );
  });
  it('has matching Thai/English keys and interpolation variables for every resource', () => {
    const th = flatten(messages.th),
      en = flatten(messages.en);
    expect(Object.keys(en).sort()).toEqual(Object.keys(th).sort());
    for (const [key, text] of Object.entries(th)) {
      expect(en[key].trim(), key).not.toBe('');
      expect(text.trim(), key).not.toBe('');
      expect(en[key].match(/\{\w+\}/g)?.sort() ?? [], key).toEqual(
        text.match(/\{\w+\}/g)?.sort() ?? [],
      );
      expect(en[key], key).not.toMatch(/[\u0e01-\u0e3a\u0e40-\u0e5b]/);
    }
  });

  it('falls back to Thai when an English translation is empty', () => {
    const original = messages.en.common.save;
    try {
      Reflect.set(messages.en.common, 'save', '');
      expect(translate('en', 'common.save')).toBe('บันทึก');
    } finally {
      Reflect.set(messages.en.common, 'save', original);
    }
  });

  it('interpolates values as plain text without changing identifiers or exact decimals', () => {
    expect(
      translate('en', 'common.records', { count: '9007199254740993.125' }),
    ).toBe('9007199254740993.125 records');
    expect(localize('en', 'สินค้าเฉพาะของลูกค้า <script>')).toBe(
      'สินค้าเฉพาะของลูกค้า <script>',
    );
  });
});
