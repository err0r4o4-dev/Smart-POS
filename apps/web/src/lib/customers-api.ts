import { organizationRequest } from './organization-api';
export interface CustomerGroup {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
  revision: number;
  member_count: number;
}
export interface CustomerInput {
  code: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  marketing_consent: boolean;
  revision?: number;
}
export interface Customer extends CustomerInput {
  id: string;
  status: 'ACTIVE' | 'ARCHIVED';
  revision: number;
  created_at: string;
  updated_at: string;
  groups: CustomerGroup[];
}
export interface CustomerSelection {
  id: string;
  code: string;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
}
export interface CustomerPage<Item> {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
}
export interface CustomerActivity {
  id: string;
  kind: 'SALE' | 'REPLACEMENT' | 'RETURN' | 'REFUND' | 'EXCHANGE' | 'REVERSAL';
  number: string;
  status: string;
  occurred_at: string;
  branch_id: string;
  branch_name: string;
  sale_id: string;
  return_id: string | null;
  adjustment_id: string | null;
  amount: string;
  paid: string;
  refunded: string;
  pending_refund: string;
  return_credit: string;
}
export interface CustomerHistory extends CustomerPage<CustomerActivity> {
  summary: {
    purchases: number;
    replacements: number;
    paid: string;
    refunded: string;
    pending_refund: string;
    net_collected: string;
  };
}
export function customerRequest<Result>(
  org: string,
  path: string,
  options: Parameters<typeof organizationRequest>[1] = {},
) {
  return organizationRequest<Result>(`/organizations/${org}${path}`, options);
}
export function customerInput(value: Customer): CustomerInput {
  return {
    code: value.code,
    name: value.name,
    phone: value.phone,
    email: value.email,
    notes: value.notes,
    marketing_consent: value.marketing_consent,
    revision: value.revision,
  };
}
