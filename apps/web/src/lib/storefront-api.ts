import { ApiError } from './api';
import { exactDecimal } from './pos-api';

export interface ShopSummary {
  slug: string;
  name: string;
  accepting_orders: boolean;
}
export interface ShopSettings extends ShopSummary {
  description: string;
  contact_phone: string;
  pickup_instructions: string;
  terminal_id?: string;
  branch_id?: string;
  stock_location_id?: string;
  published: boolean;
  revision: number;
}
export interface ShopProduct {
  variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  unit: string;
  unit_type: string;
  unit_price: string;
  available: string;
  saleable: boolean;
  published: boolean;
}
export interface ShopPage<Item> {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
}
export interface ShopLine {
  variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  unit: string;
  quantity: string;
  unit_price: string;
  line_total: string;
}
export interface ShopQuote {
  quote_id: string;
  items: ShopLine[];
  estimated_total: string;
  currency: 'THB';
}
export type OrderStatus =
  | 'PENDING'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';
export interface OnlineOrder {
  id: string;
  number: string;
  status: OrderStatus;
  payment_status: 'UNPAID' | 'PAID_AT_STORE';
  customer_name?: string;
  contact_phone?: string;
  customer_note?: string;
  store_name: string;
  store_phone: string;
  pickup_instructions: string;
  estimated_total: string;
  final_total: string | null;
  receipt_number: string | null;
  branch_id?: string;
  terminal_id?: string;
  cart_id?: string;
  sale_id?: string;
  revision: number;
  created_at: string;
  expires_at: string;
  items: ShopLine[];
  events: { status: OrderStatus; message: string; created_at: string }[];
}
export interface ShopOrderInput {
  items: { variant_id: string; quantity: string }[];
  quote_id: string;
  customer_name: string;
  contact_phone: string;
  customer_note: string;
  access_token: string;
}
export const orderStatusLabels: Record<OrderStatus, string> = {
  PENDING: 'รอร้านตรวจสอบ',
  PREPARING: 'กำลังเตรียมสินค้า',
  READY: 'พร้อมรับสินค้า',
  COMPLETED: 'สำเร็จ',
  REJECTED: 'ร้านปฏิเสธออเดอร์',
  CANCELLED: 'ยกเลิกแล้ว',
  EXPIRED: 'ออเดอร์หมดอายุ',
};
export class StorefrontError extends ApiError {
  constructor(
    status: number,
    public code: string,
    message: string,
  ) {
    super(status, message);
  }
}
export async function storefrontRequest<Result>(
  path: string,
  options: { body?: object; key?: string; signal?: AbortSignal } = {},
): Promise<Result> {
  const response = await fetch(`/api/v1/storefronts${path}`, {
    method: options.body === undefined ? 'GET' : 'POST',
    credentials: 'omit',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(options.key ? { 'Idempotency-Key': options.key } : {}),
    },
    ...(options.body === undefined
      ? {}
      : { body: JSON.stringify(options.body) }),
  });
  const result = (await response.json()) as {
    data?: Result;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || result.data === undefined)
    throw new StorefrontError(
      response.status,
      result.error?.code ?? 'UNAVAILABLE',
      result.error?.message ?? 'เชื่อมต่อหน้าร้านไม่ได้ กรุณาลองใหม่',
    );
  return result.data;
}
export function newTrackingToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
}
export function estimatedLine(price: string, quantity: string) {
  const cents = exactDecimal(price);
  const units = exactDecimal(quantity, 3);
  if (cents === null || units === null || units <= 0n) return null;
  return (cents * units + 500n) / 1000n;
}
export function centsText(cents: bigint) {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}
