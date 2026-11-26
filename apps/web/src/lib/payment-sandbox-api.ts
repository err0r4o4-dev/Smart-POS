import { ApiError } from './api';
import { organizationRequest } from './organization-api';

export interface SandboxStatus {
  provider: 'stripe';
  mode: 'test';
  configured: boolean;
  amount_minor: 2000;
  currency: 'thb';
  customer_checkout_enabled: false;
}
export interface SandboxRefund {
  id: string;
  status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled';
  amount_minor: 2000;
  currency: 'thb';
}
export interface SandboxCheckout {
  id: string;
  url: string;
  status: 'open' | 'complete' | 'expired';
  payment_status: 'paid' | 'unpaid';
  amount_minor: 2000;
  currency: 'thb';
  refund: SandboxRefund | null;
}
export const sandboxSessionPattern = /^cs_test_[A-Za-z0-9]{1,220}$/;
const invalidResponse = () =>
  new ApiError(502, 'ข้อมูล Stripe sandbox ไม่ถูกต้อง กรุณาตรวจสถานะใหม่');
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalidResponse();
  return value as Record<string, unknown>;
}
function parseRefund(value: unknown): SandboxRefund {
  const refund = record(value);
  if (
    typeof refund.id !== 'string' ||
    !/^re_[A-Za-z0-9]{1,220}$/.test(refund.id) ||
    refund.amount_minor !== 2000 ||
    refund.currency !== 'thb' ||
    typeof refund.status !== 'string' ||
    !['pending', 'requires_action', 'succeeded', 'failed', 'canceled'].includes(
      refund.status,
    )
  )
    throw invalidResponse();
  return refund as unknown as SandboxRefund;
}
function parseCheckout(value: unknown): SandboxCheckout {
  const checkout = record(value);
  if (
    typeof checkout.id !== 'string' ||
    !sandboxSessionPattern.test(checkout.id) ||
    checkout.amount_minor !== 2000 ||
    checkout.currency !== 'thb' ||
    typeof checkout.status !== 'string' ||
    !['open', 'complete', 'expired'].includes(checkout.status) ||
    typeof checkout.payment_status !== 'string' ||
    !['paid', 'unpaid'].includes(checkout.payment_status) ||
    typeof checkout.url !== 'string'
  )
    throw invalidResponse();
  if (checkout.url || checkout.status === 'open') {
    let url: URL;
    try {
      url = new URL(checkout.url);
    } catch {
      throw invalidResponse();
    }
    if (
      url.protocol !== 'https:' ||
      url.host !== 'checkout.stripe.com' ||
      url.username ||
      url.password ||
      url.pathname !== `/c/pay/${checkout.id}`
    )
      throw invalidResponse();
  }
  if (checkout.payment_status === 'paid' && checkout.status !== 'complete')
    throw invalidResponse();
  const refund = checkout.refund === null ? null : parseRefund(checkout.refund);
  if (refund && checkout.payment_status !== 'paid') throw invalidResponse();
  return { ...checkout, refund } as unknown as SandboxCheckout;
}
const root = (organization: string) =>
  `/organizations/${encodeURIComponent(organization)}/storefront/payment-sandbox`;
export async function sandboxStatus(
  organization: string,
  signal?: AbortSignal,
): Promise<SandboxStatus> {
  const value = record(
    await organizationRequest<unknown>(root(organization), { signal }),
  );
  if (
    value.provider !== 'stripe' ||
    value.mode !== 'test' ||
    typeof value.configured !== 'boolean' ||
    value.amount_minor !== 2000 ||
    value.currency !== 'thb' ||
    value.customer_checkout_enabled !== false
  )
    throw invalidResponse();
  return value as unknown as SandboxStatus;
}
export async function createSandboxCheckout(
  organization: string,
  csrf: string,
  key: string,
): Promise<SandboxCheckout> {
  return parseCheckout(
    await organizationRequest<unknown>(`${root(organization)}/checkouts`, {
      method: 'POST',
      body: {},
      csrf,
      key,
    }),
  );
}
export async function sandboxCheckout(
  organization: string,
  session: string,
  signal?: AbortSignal,
): Promise<SandboxCheckout> {
  if (!sandboxSessionPattern.test(session)) throw invalidResponse();
  return parseCheckout(
    await organizationRequest<unknown>(
      `${root(organization)}/checkouts/${session}`,
      { signal },
    ),
  );
}
export async function refundSandboxCheckout(
  organization: string,
  csrf: string,
  session: string,
): Promise<SandboxRefund> {
  if (!sandboxSessionPattern.test(session)) throw invalidResponse();
  return parseRefund(
    await organizationRequest<unknown>(
      `${root(organization)}/checkouts/${session}/refund`,
      { method: 'POST', body: {}, csrf },
    ),
  );
}
