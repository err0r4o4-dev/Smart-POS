export interface InventoryPageData<Item> {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
}
export interface StockLocation {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  parent_location_id: string | null;
  description: string;
  revision: number;
  is_system: boolean;
}
export interface StockBalance {
  id: string;
  branch_id: string;
  location_id: string;
  variant_id: string;
  quantity: string;
  available: string;
  reserved: string;
  availability_status: string;
  product_name: string;
  variant_name: string;
  sku: string;
  barcode: string | null;
  unit: string;
  location_name: string;
  location_type: string;
  updated_at: string;
}
export interface StockMovement {
  id: string;
  sku: string;
  variant_id: string;
  location_id: string;
  movement_type: string;
  quantity_delta: string;
  quantity_before: string;
  quantity_after: string;
  performed_by: string;
  document_id: string | null;
  operation_id: string;
  reason_code: string;
  created_at: string;
}
export interface InventoryItem {
  variant_id: string;
  quantity: string;
  expected_quantity: string | null;
  counted_quantity: string | null;
  variance?: string | null;
  sku?: string;
  product_name?: string;
  unit?: string;
  counted_by?: string | null;
  counted_at?: string | null;
}
export interface InventoryDocument {
  id: string;
  kind: 'ADJUSTMENT' | 'COUNT' | 'TRANSFER';
  branch_id: string;
  location_id: string;
  destination_branch_id: string | null;
  destination_location_id: string | null;
  transit_location_id: string | null;
  status: string;
  revision: number;
  reason_code: string;
  notes: string;
  adjustment_type: string | null;
  assigned_to: string | null;
  created_by: string;
  approved_by: string | null;
  dispatched_by: string | null;
  received_by: string | null;
  posted_by: string | null;
  created_at: string;
  items: InventoryItem[];
  history?: {
    event_type: string;
    actor_id: string;
    created_at: string;
    request_id: string;
  }[];
}
export interface ReorderPoint {
  id: string;
  branch_id: string;
  variant_id: string;
  sku: string;
  minimum_quantity: string;
  target_quantity: string;
  current_quantity: string;
  below_minimum: boolean;
  status: string;
}
export interface InventoryOverview {
  alerts: { active_variants: number; low_stock_variants: number };
  recent_movements: Pick<
    StockMovement,
    'id' | 'sku' | 'movement_type' | 'quantity_delta' | 'created_at'
  >[];
  stock: {
    recorded_variants: number;
    by_unit: { unit: string; type: string; quantity: string }[];
  };
  operations: {
    pending_adjustments: number;
    open_counts: number;
    pending_transfers: number;
  };
  reservation_policy: string;
}
export function scaledQuantity(value: string): bigint {
  if (!/^-?\d+(\.\d{1,3})?$/.test(value)) throw new Error('Invalid quantity');
  const negative = value.startsWith('-');
  const [whole, fraction = ''] = value.replace(/^-/, '').split('.');
  const result = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  return negative ? -result : result;
}
export function quantityVariance(expected: string, counted: string): string {
  const result = scaledQuantity(counted) - scaledQuantity(expected),
    absolute = result < 0n ? -result : result;
  return `${result < 0n ? '-' : ''}${absolute / 1000n}.${String(absolute % 1000n).padStart(3, '0')}`;
}
export function variancePercent(expected: string, counted: string): string {
  const baseline = scaledQuantity(expected);
  if (baseline === 0n) return '—';
  const hundredths = ((scaledQuantity(counted) - baseline) * 10000n) / baseline;
  const absolute = hundredths < 0n ? -hundredths : hundredths;
  return `${hundredths < 0n ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}%`;
}
