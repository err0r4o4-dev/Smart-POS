export type StockDisposition =
  'RESTOCK_SELLABLE' | 'QUARANTINE' | 'DAMAGED' | 'NO_STOCK_RETURN';
export interface ReturnableSale {
  id: string;
  sale_number: string;
  branch_id: string;
  grand_total: string;
  items: {
    id: string;
    variant_id: string;
    batch_id?: string | null;
    product_name: string;
    sku: string;
    quantity: string;
    unit_price: string;
    line_total: string;
    returned_quantity: string;
    returnable_quantity: string;
    refunded_amount: string;
    stock_location_id: string;
  }[];
}
export interface CustomerReturn {
  id: string;
  branch_id: string;
  original_sale_id: string;
  number: string;
  reason: string;
  status: string;
  revision: number;
  amount: string;
  refund_id: string | null;
  created_by: string;
  approved_by: string | null;
  completed_by: string | null;
  created_at: string;
  approved_at: string | null;
  completed_at: string | null;
  items: {
    id: string;
    batch_id?: string | null;
    product_name: string;
    sku: string;
    quantity: string;
    refund_amount: string;
    original_sale_item_id: string;
    disposition: StockDisposition;
    destination_location_id: string | null;
    movement_id: string | null;
  }[];
}
export interface CustomerRefund {
  id: string;
  branch_id: string;
  return_id: string;
  return_number?: string;
  amount: string;
  method: string | null;
  status: string;
  revision: number;
  reference: string;
  settlement_note: string;
  shift_id: string | null;
  events: {
    id: string;
    action: string;
    reference: string;
    note: string;
    created_at: string;
  }[];
  cash_disbursement_id: string | null;
  reported_by: string | null;
  confirmed_by: string | null;
  created_at: string;
  reported_at: string | null;
  confirmed_at: string | null;
}
export function validReturnQuantity(value: string, maximum: string): boolean {
  const pattern = /^(0|[1-9][0-9]{0,14})(\.[0-9]{1,3})?$/;
  if (!pattern.test(value) || !pattern.test(maximum)) return false;
  const scaled = (text: string) => {
    const [whole, fraction = ''] = text.split('.');
    return BigInt(whole + fraction.padEnd(3, '0'));
  };
  const amount = scaled(value);
  return amount > 0n && amount <= scaled(maximum);
}
