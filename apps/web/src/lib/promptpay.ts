/**
 * PromptPay EMVCo QR Code Payload Generator
 * Supports dynamic amount QR code for Thai Mobile Banking
 */

export function calculateCRC16(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function generatePromptPayPayload(
  amount: string | number,
  targetPhoneOrTaxId = '0812345678',
): string {
  let clean = targetPhoneOrTaxId.replace(/[^0-9]/g, '');
  if (!clean) clean = '0812345678';

  let subTag: string;
  if (clean.length >= 13) {
    // National ID or Tax ID (13 digits)
    subTag = '02' + String(clean.length).padStart(2, '0') + clean;
  } else {
    // Phone number (e.g. 0812345678 -> 0066812345678)
    if (clean.startsWith('0')) {
      clean = '0066' + clean.slice(1);
    }
    subTag = '01' + String(clean.length).padStart(2, '0') + clean;
  }

  const aid = '0016A000000677010111';
  const tag29Data = aid + subTag;
  const tag29 = '29' + String(tag29Data.length).padStart(2, '0') + tag29Data;

  const numAmt = typeof amount === 'number' ? amount : parseFloat(amount) || 0;
  const amtStr = numAmt.toFixed(2);
  const tag54 = '54' + String(amtStr.length).padStart(2, '0') + amtStr;

  // 00: Payload Format Indicator (01)
  // 01: Point of Initiation Method (12 = Dynamic)
  // 29: Merchant Account Information
  // 53: Transaction Currency (764 = THB)
  // 54: Transaction Amount
  // 58: Country Code (TH)
  // 63: CRC (Checksum)
  const raw = '000201010212' + tag29 + '5303764' + tag54 + '5802TH6304';
  const crc = calculateCRC16(raw);

  return raw + crc;
}
