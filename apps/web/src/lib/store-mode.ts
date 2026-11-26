import { ApiError } from './api';

export type StoreMode = 'single' | 'multi';

export function responseStoreMode(headers?: Pick<Headers, 'get'>): StoreMode {
  const value = headers?.get('X-SmartPOS-Store-Mode');
  if (value === null || value === undefined) return 'multi';
  if (value === 'single' || value === 'multi') return value;
  throw new ApiError(502, 'ข้อมูลโหมดร้านไม่ถูกต้อง กรุณาตรวจการตั้งค่าระบบ');
}
