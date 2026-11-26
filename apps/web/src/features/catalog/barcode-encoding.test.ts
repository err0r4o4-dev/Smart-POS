import { describe, expect, it } from 'vitest';
import { barcodeBits } from './barcode-encoding';

describe('barcode label encoding', () => {
  it.each([
    ['4006381333931', 'EAN13', 95],
    ['96385074', 'EAN8', 67],
    ['036000291452', 'UPCA', 95],
  ])(
    'encodes %s with valid guards and module count',
    (code, symbology, size) => {
      const bits = barcodeBits(String(code), String(symbology));
      expect(bits).toHaveLength(Number(size));
      expect(bits).toMatch(/^[01]+$/);
      expect(bits.startsWith('101')).toBe(true);
      expect(bits.endsWith('101')).toBe(true);
      expect(bits.slice((bits.length - 5) / 2, (bits.length + 5) / 2)).toBe(
        '01010',
      );
    },
  );
  it('preserves the leading zero of UPC-A and encodes it as EAN-13', () => {
    expect(barcodeBits('036000291452', 'UPCA')).toBe(
      barcodeBits('0036000291452', 'EAN13'),
    );
  });
  it('encodes Code 128 B start, weighted checksum and stop', () => {
    expect(barcodeBits('A', 'CODE128')).toBe(
      '1101001000010100011000100010110001100011101011',
    );
    expect(
      barcodeBits('SP-0123456789ABCDEF0123456789ABCDEF', 'CODE128'),
    ).toHaveLength(420);
  });
  it.each([
    ['4006381333932', 'EAN13'],
    ['12345678', 'EAN8'],
    ['036000291453', 'UPCA'],
    ['123', 'EAN13'],
    ['', 'CODE128'],
    ['ไทย', 'CODE128'],
    ['ABC\n', 'CODE128'],
    ['A'.repeat(81), 'CODE128'],
    ['123', 'QR'],
  ])('rejects invalid barcode %s / %s', (code, symbology) => {
    expect(() => barcodeBits(code, symbology)).toThrow();
  });
});
