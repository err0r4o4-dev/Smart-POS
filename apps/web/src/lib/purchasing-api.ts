import { exactDecimal } from './pos-api';

export interface SupplyPage<Item> {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
}
export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  tax_identifier: string;
  notes: string;
  status: string;
  revision: number;
}
export interface SupplierProduct {
  id: string;
  supplier_id: string;
  variant_id: string;
  purchase_unit_id: string;
  supplier_sku: string;
  sku: string;
  name: string;
  unit_cost: string;
  minimum_order_quantity: string;
  order_multiple: string;
  lead_time_days: number;
  is_preferred: boolean;
  status: string;
  revision: number;
}
export interface PurchaseLine {
  id: string;
  variant_id: string;
  parent_item_id: string | null;
  purchase_unit_id: string;
  inventory_unit_id: string;
  name_snapshot: string;
  sku_snapshot: string;
  unit_snapshot: string;
  conversion_factor: string;
  quantity: string;
  base_quantity: string;
  accepted_quantity: string;
  outstanding_quantity: string;
  unit_cost: string;
  line_total: string;
  delivered_quantity: string;
  rejected_quantity: string;
  damaged_quantity: string;
  reason: string;
}
export interface PurchaseDocument {
  id: string;
  branch_id: string;
  supplier_id: string;
  supplier_snapshot: Supplier;
  kind: 'ORDER' | 'RECEIPT' | 'RETURN';
  number: string;
  status: string;
  revision: number;
  parent_id: string | null;
  location_id: string | null;
  currency: string;
  expected_delivery_date: string | null;
  total: string;
  notes: string;
  created_by: string;
  approved_by: string | null;
  created_at: string;
  items: PurchaseLine[];
  events: {
    id: string;
    action: string;
    revision: number;
    actor_id: string;
    reason: string;
    created_at: string;
  }[];
  children: { id: string; kind: string; number: string; status: string }[];
}
export interface OrderLineInput {
  variant_id: string;
  purchase_unit_id: string;
  quantity: string;
  unit_cost: string;
}
export interface PurchaseSuggestion {
  id: string;
  branch_id: string;
  variant_id: string;
  sku: string;
  name: string;
  current_quantity: string;
  minimum_quantity: string;
  target_quantity: string;
  incoming_quantity: string;
  supplier_id: string;
  supplier_name: string;
  purchase_unit_id: string;
  purchase_unit: string;
  unit_cost: string;
  lead_time_days: number;
  suggested_quantity: string;
  explanation: string;
}
export interface ShelfSlot {
  id: string;
  code: string;
  position: number;
}
export interface ShelfAssignment {
  id: string;
  slot_id: string;
  slot_code: string;
  variant_id: string;
  sku: string;
  name: string;
  unit: string;
  minimum_quantity: string;
  target_quantity: string;
  capacity_quantity: string;
  recorded_quantity: string;
  status: string;
  revision: number;
  last_count: {
    document_id: string;
    status: string;
    expected_quantity: string;
    counted_quantity: string;
    variance: string;
    counted_at: string;
  } | null;
}
export interface Shelf {
  id: string;
  branch_id: string;
  stock_location_id: string;
  code: string;
  name: string;
  zone: string;
  description: string;
  status: string;
  revision: number;
  assignment_count: number;
  low_stock_count: number;
  slots: ShelfSlot[];
  assignments: ShelfAssignment[];
}
export interface ReplenishmentTask {
  id: string;
  shelf_id: string;
  shelf_name: string;
  assignment_id: string;
  variant_id: string;
  sku: string;
  source_location_id: string;
  source_name: string;
  quantity: string;
  status: string;
  assigned_to: string | null;
  revision: number;
  transfer_id: string | null;
}
export interface ReplenishmentSuggestion {
  id: string;
  assignment_id: string;
  shelf_id: string;
  shelf_name: string;
  sku: string;
  recorded_quantity: string;
  minimum_quantity: string;
  target_quantity: string;
  capacity_quantity: string;
  source_location_id: string;
  source_name: string;
  available_quantity: string;
  suggested_quantity: string;
  explanation: string;
}
export function exactLineCost(quantity: string, cost: string): string | null {
  const amount = exactDecimal(quantity, 3),
    cents = exactDecimal(cost, 2);
  if (amount === null || cents === null) return null;
  const total = (amount * cents + 500n) / 1000n;
  if (total >= 10n ** 18n) return null;
  return `${total / 100n}.${(total % 100n).toString().padStart(2, '0')}`;
}
export function exactOrderTotal(lines: OrderLineInput[]): string | null {
  let total = 0n;
  for (const line of lines) {
    const value = exactLineCost(line.quantity, line.unit_cost);
    if (value === null) return null;
    total += exactDecimal(value, 2)!;
  }
  if (total >= 10n ** 18n) return null;
  return `${total / 100n}.${(total % 100n).toString().padStart(2, '0')}`;
}
