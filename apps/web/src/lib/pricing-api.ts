import { organizationRequest } from './organization-api';
export interface PricingRule {
  type: 'PERCENTAGE' | 'FIXED' | 'BOGO' | 'MINIMUM_SPEND';
  policy: 'EXCLUSIVE' | 'STACKABLE' | 'BEST_DISCOUNT_ONLY';
  basis_points: number;
  amount: string;
  minimum_spend: string;
  buy: number;
  get: number;
  variant_ids: string[];
  category_ids: string[];
  usage_limit: number;
}
export interface PriceDefinition {
  id: string;
  name: string;
  branch_id: string;
  status: string;
  revision: number;
  priority: number;
  starts_at: string | null;
  ends_at: string | null;
  items?: { variant_id: string; unit_price: string }[];
  rule?: PricingRule;
}
export interface PricingQuote {
  loyalty?: {
    account_id: string;
    program_id: string;
    program_revision: number;
    points: number;
    amount: string;
    point_value: string;
  };
  subtotal: string;
  discount: string;
  total: string;
  revision: string;
  approval_id?: string;
  lines: {
    variant_id: string;
    quantity: string;
    unit_price: string;
    gross: string;
    discount: string;
    net: string;
    price_list_id: string;
    price_revision: number;
  }[];
  promotions: {
    id: string;
    name: string;
    revision: number;
    discount: string;
    rule: PricingRule;
  }[];
}
export interface DiscountApproval {
  id: string;
  cart_id: string;
  cart_revision: number;
  pricing_revision: string;
  amount: string;
  reason: string;
  status: string;
  revision: number;
  requested_by: string;
  approved_by: string | null;
  expires_at: string;
  branch_id: string;
}
export function pricingRequest<Result>(
  org: string,
  path: string,
  options: Parameters<typeof organizationRequest>[1] = {},
) {
  return organizationRequest<Result>(`/organizations/${org}${path}`, options);
}
