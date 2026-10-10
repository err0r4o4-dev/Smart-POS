import { organizationRequest } from './organization-api';
import type { PricingQuote } from './pricing-api';
import type { CustomerSelection } from './customers-api';

export interface POSPage<Item> {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
}
export interface POSTerminal {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  stock_location_id: string;
  status: string;
  revision: number;
}
export interface POSItem {
  variant_id: string;
  product_name: string;
  variant_name: string;
  sku: string;
  barcode: string;
  unit: string;
  unit_type: string;
  unit_price: string;
  quantity: string;
  line_total: string;
  available: string;
  product_status: string;
  variant_status: string;
  unit_status: string;
  saleable: boolean;
  price_changed: boolean;
  previous_price: string;
}
export interface POSCart {
  customer_id?: string | null;
  customer?: CustomerSelection | null;
  customer_cleared?: boolean;
  id: string;
  branch_id: string;
  terminal_id: string;
  cashier_id: string;
  status: string;
  revision: number;
  items: POSItem[];
  total: string;
  review_required: boolean;
  pricing?: PricingQuote;
}
export interface CartSummary {
  id: string;
  terminal_id: string;
  revision: number;
  status: string;
  updated_at: string;
}
export interface POSShift {
  id: string;
  terminal_id: string;
  cashier_id: string;
  terminal_name: string;
  cashier_name: string;
  status: string;
  opening_cash: string;
  cash_sales: string;
  cash_refunds?: string;
  expected_cash: string;
  counted_cash: string | null;
  difference: string | null;
  opened_at: string;
  closed_at: string | null;
}
export type PaymentMethod = 'CASH' | 'QR_MANUAL' | 'BANK_TRANSFER_MANUAL';
export type RecordedPaymentMethod = PaymentMethod | 'EXCHANGE_CREDIT' | 'NONE';
export interface POSCheckout {
  customer_id?: string | null;
  customer_code_snapshot?: string;
  id: string;
  cart_id: string;
  terminal_id: string;
  shift_id: string;
  status: string;
  method: RecordedPaymentMethod;
  total: string;
  received: string;
  change: string;
  reference: string;
  failure_code: string;
  sale_id: string;
  items: POSItem[];
  resolution_note?: string;
}
export interface SaleSummary {
  id: string;
  sale_number: string;
  branch_id: string;
  terminal_id: string;
  branch_name: string;
  terminal_name: string;
  cashier_name: string;
  grand_total: string;
  method: RecordedPaymentMethod;
  payment_status: string;
  status: string;
  completed_at: string;
  receipt_id: string;
  receipt_number: string;
}
export interface POSSale extends SaleSummary {
  customer_id?: string | null;
  customer_code_snapshot?: string;
  store_name: string;
  store_address: string;
  currency: string;
  subtotal: string;
  discount_total: string;
  tax_total: string;
  inventory_operation_id: string;
  items: (Pick<
    POSItem,
    | 'variant_id'
    | 'product_name'
    | 'variant_name'
    | 'sku'
    | 'barcode'
    | 'unit'
    | 'quantity'
    | 'unit_price'
    | 'line_total'
  > & { stock_location_id: string })[];
  payment: {
    method: RecordedPaymentMethod;
    amount: string;
    credit_amount?: string;
    received: string;
    change: string;
    status: string;
    reference: string;
    confirmed_by: string;
    confirmed_at: string;
  };
  receipt: { id: string; receipt_number: string };
  movements: {
    id: string;
    quantity_delta: string;
    quantity_before: string;
    quantity_after: string;
    location_id: string;
    variant_id: string;
  }[];
  audit: { event_type: string; created_at: string; actor_id: string }[];
  adjustments?: {
    id: string;
    kind: string;
    number: string;
    status: string;
    net_difference: string;
  }[];
  returns?: { id: string; number: string; status: string }[];
}

export function posRequest<Result>(
  org: string,
  path: string,
  options: Parameters<typeof organizationRequest>[1] = {},
) {
  return organizationRequest<Result>(`/organizations/${org}${path}`, options);
}
export function exactDecimal(value: string, precision = 2): bigint | null {
  if (
    !new RegExp(`^[0-9]{1,${18 - precision}}(\\.[0-9]{1,${precision}})?$`).test(
      value,
    )
  )
    return null;
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole + fraction.padEnd(precision, '0'));
}
export function moneyText(value: string) {
  const [whole, fraction = '00'] = value.split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction.padEnd(2, '0')}`;
}
export function adjustQuantity(value: string, step: bigint) {
  const amount = exactDecimal(value, 3);
  if (amount === null || amount + step <= 0n) return value;
  const next = amount + step;
  return `${next / 1000n}.${(next % 1000n).toString().padStart(3, '0')}`;
}
export const paymentLabels: Record<RecordedPaymentMethod, string> = {
  CASH: 'เงินสด',
  QR_MANUAL: 'QR — ยืนยันด้วยตนเอง',
  BANK_TRANSFER_MANUAL: 'โอนธนาคาร — ยืนยันด้วยตนเอง',
  EXCHANGE_CREDIT: 'เครดิตเปลี่ยนสินค้า — ไม่ใช่เงินรับใหม่',
  NONE: 'ยอดสุทธิศูนย์ — ไม่มีการรับเงิน',
};
