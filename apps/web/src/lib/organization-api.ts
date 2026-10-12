import type { Role } from '../app/access';
import { requestData } from './api';
import { responseStoreMode, type StoreMode } from './store-mode';
export interface OrganizationInput {
  name: string;
  code: string;
  business_type: string;
  contact_email: string;
  contact_phone: string;
  address: string;
}
export interface Organization extends OrganizationInput {
  id: string;
  currency: string;
  status: string;
}
export interface BranchInput {
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  status: string;
}
export interface Branch extends BranchInput {
  id: string;
  organization_id: string;
  is_main: boolean;
}
export interface Member {
  id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: Role;
  status: string;
  branch_ids: string[];
  permissions: string[];
}
export interface OrganizationContext {
  organization: Organization;
  membership: Member;
  branches: Branch[];
  permissions: string[];
}
export interface Invitation {
  id: string;
  email: string;
  role: Role;
  branch_ids: string[];
  expires_at: string;
  status: string;
}
export interface AuditEvent {
  id: number;
  actor_id: string;
  event_type: string;
  object_id: string;
  request_id: string;
  created_at: string;
}
export async function organizationRequest<Result>(
  path: string,
  options: {
    method?: string;
    body?: object;
    csrf?: string;
    key?: string;
    signal?: AbortSignal;
    storeMode?: (mode: StoreMode) => void;
  } = {},
): Promise<Result> {
  return requestData<Result>(
    `/api/v1${path}`,
    {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      signal: options.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.csrf ? { 'X-CSRF-Token': options.csrf } : {}),
        ...(options.key ? { 'Idempotency-Key': options.key } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    },
    options.storeMode
      ? (headers) => options.storeMode?.(responseStoreMode(headers))
      : undefined,
  );
}
