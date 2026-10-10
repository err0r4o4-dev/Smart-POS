import { organizationRequest } from './organization-api';

export const untrackedBatch = {
  batch_id: null as string | null,
  batch_verified: false,
};

export interface ProductBatch {
  history?: {
    revision: number;
    status: string;
    reason: string;
    actor_id: string;
    recorded_at: string;
  }[];
  id: string;
  variant_id: string;
  lot_number: string;
  manufactured_on: string | null;
  expires_on: string | null;
  status: 'ACTIVE' | 'QUARANTINED';
  reason: string;
  revision: number;
}
export interface QualityBalance {
  id: string;
  branch_id: string;
  location_id: string;
  variant_id: string;
  batch_id: string | null;
  quantity: string;
  lot_number: string | null;
  expires_on: string | null;
  batch_status: string | null;
  provenance: 'UNTRACKED' | 'RECORDED_LOT';
  sellable: boolean;
}
export interface QualityWriteOff {
  id: string;
  location_id: string;
  variant_id: string;
  batch_id: string | null;
  quantity: string;
  reason: string;
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'POSTED' | 'REJECTED';
  revision: number;
  operation_id: string | null;
}
export interface QualityRecall {
  id: string;
  variant_id: string;
  batch_id: string | null;
  reason: string;
  created_at: string;
  affected_locations: Pick<
    QualityBalance,
    'location_id' | 'batch_id' | 'quantity'
  >[];
}
export function qualityRequest<Result>(
  org: string,
  path: string,
  options: Parameters<typeof organizationRequest>[1] = {},
) {
  return organizationRequest<Result>(
    `/organizations/${org}/quality${path}`,
    options,
  );
}
