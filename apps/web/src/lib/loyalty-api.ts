import { organizationRequest } from './organization-api';
export interface LoyaltyProgram {
  id: string;
  name: string;
  spend: string;
  earn_points: number;
  point_value: string;
  status: 'ACTIVE' | 'SUSPENDED';
  revision: number;
}
export interface LoyaltyAccount {
  id: string;
  customer_id: string;
  customer_code: string;
  customer_name: string;
  program_id: string;
  program_name: string;
  program_status: string;
  status: 'ACTIVE' | 'SUSPENDED';
  revision: number;
  balance: string;
  available: string;
}
export interface LoyaltyEntry {
  id: string;
  account_id: string;
  kind: string;
  points: string;
  sale_id: string | null;
  return_id: string | null;
  reason: string;
  snapshot: Record<string, unknown>;
  created_at: string;
}
export interface LoyaltyPage<Item> {
  items: Item[];
  page?: number;
  total?: number;
}
export function loyaltyRequest<Result>(
  org: string,
  path: string,
  options: Parameters<typeof organizationRequest>[1] = {},
) {
  return organizationRequest<Result>(`/organizations/${org}${path}`, options);
}
