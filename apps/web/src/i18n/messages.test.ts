import { describe, expect, it } from 'vitest';
import { messages, translate, localize } from './index';

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
