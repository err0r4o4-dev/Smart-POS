import type { CustomerReturn } from './returns-api';
import type { POSItem } from './pos-api';

export interface AdjustmentQuote {
  branch_id: string;
  return_credit: string;
  replacement_total: string;
  net_difference: string;
  replacement_items: POSItem[];
}
export interface SaleAdjustment extends AdjustmentQuote {
  id: string;
  kind: 'EXCHANGE' | 'REVERSAL';
  number: string;
  status: string;
  reason: string;
  revision: number;
  original_sale_id: string;
  original_sale_number: string;
  linked_return_id: string;
  replacement_sale_id: string | null;
  terminal_id: string | null;
  shift_id: string | null;
  method: string | null;
  reference: string;
  reported_at: string | null;
  completed_at: string | null;
  created_by: string;
  approved_by: string | null;
  store_name: string;
  branch_name: string;
  cashier_name: string;
  failure_code: string;
  return_document: CustomerReturn;
  events: {
    id: string;
    action: string;
    reference: string;
    note: string;
    created_at: string;
  }[];
  audit: { event_type: string; actor_id: string; created_at: string }[];
}
export function settlementMethods(difference: string) {
  if (difference === '0.00') return ['NONE'];
  return difference.startsWith('-')
    ? ['CASH_REFUND', 'MANUAL_BANK_REFUND', 'MANUAL_ORIGINAL_METHOD_REFUND']
    : ['CASH', 'QR_MANUAL', 'BANK_TRANSFER_MANUAL'];
}
