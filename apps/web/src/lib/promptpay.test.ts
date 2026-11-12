import { describe, expect, it } from 'vitest';
import { calculateCRC16, generatePromptPayPayload } from './promptpay';

describe('PromptPay Generator', () => {
  it('calculates valid CCITT-FALSE CRC16 checksum', () => {
    const data = '00020101021229370016A000000677010111011300668123456785303764540560.005802TH6304';
    expect(calculateCRC16(data)).toBe('B2B2');
  });

  it('formats phone numbers and amounts into a full EMVCo string', () => {
    const payload = generatePromptPayPayload('60.00', '0812345678');
    expect(payload).toContain('000201'); // format indicator
    expect(payload).toContain('5303764'); // THB currency
    expect(payload).toContain('540560.00'); // Amount 60.00
    expect(payload).toContain('5802TH'); // Country Thailand
    expect(payload.endsWith('B2B2')).toBe(true);
  });
});
