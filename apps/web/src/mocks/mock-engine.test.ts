import { beforeEach, describe, expect, it } from 'vitest';
import { handleMockRequest, resetMockState } from './mock-engine';

describe('mock-engine', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('handles health readiness probe', () => {
    const res = handleMockRequest('/health/ready');
    expect(res).toBeDefined();
    expect(res?.status).toBe(200);
    expect(res?.body).toEqual({ status: 'ready' });
  });

  it('handles auth endpoints for session and login', () => {
    const meRes = handleMockRequest('/api/v1/auth/me');
    expect(meRes?.status).toBe(200);
    const meBody = meRes?.body as { data: { user: { email: string } } };
    expect(meBody.data.user.email).toBe('owner@smartpos.local');

    const loginRes = handleMockRequest('/api/v1/auth/login', 'POST');
    expect(loginRes?.status).toBe(200);

    const logoutRes = handleMockRequest('/api/v1/auth/logout', 'POST');
    expect(logoutRes?.status).toBe(200);
  });

  it('handles organization list and context queries', () => {
    const orgRes = handleMockRequest('/api/v1/organizations');
    expect(orgRes?.status).toBe(200);
    expect(orgRes?.headers?.['X-Store-Mode']).toBe('single');
    const orgBody = orgRes?.body as { data: Array<{ id: string; name: string }> };
    expect(orgBody.data.length).toBeGreaterThan(0);

    const ctxRes = handleMockRequest('/api/v1/organizations/' + orgBody.data[0].id + '/context');
    expect(ctxRes?.status).toBe(200);
    const ctxBody = ctxRes?.body as { data: { organization: { id: string } } };
    expect(ctxBody.data.organization.id).toBe(orgBody.data[0].id);
  });

  it('filters products by search query and category', () => {
    const allRes = handleMockRequest('/api/v1/organizations/org-1/products');
    const allBody = allRes?.body as { data: { items: Array<{ name: string }>; total: number } };
    expect(allBody.data.total).toBeGreaterThan(5);

    const searchRes = handleMockRequest(
      '/api/v1/organizations/org-1/products?search=' + encodeURIComponent('กะเพรา'),
    );
    const searchBody = searchRes?.body as { data: { items: Array<{ name: string }> } };
    expect(searchBody.data.items.length).toBeGreaterThan(0);
    expect(searchBody.data.items.some((i) => i.name.includes('กะเพรา'))).toBe(true);

    const catRes = handleMockRequest('/api/v1/organizations/org-1/products?category=c-bev');
    const catBody = catRes?.body as { data: { items: Array<{ category_id: string }> } };
    expect(catBody.data.items.every((i) => i.category_id === 'c-bev')).toBe(true);
  });

  it('handles POS shifts, carts, and checkout', () => {
    const shiftsRes = handleMockRequest('/api/v1/organizations/org-1/pos/shifts');
    expect(shiftsRes?.status).toBe(200);

    const cartsRes = handleMockRequest('/api/v1/organizations/org-1/pos/carts?status=HELD');
    expect(cartsRes?.status).toBe(200);
    const cartsBody = cartsRes?.body as { data: { items: unknown[] } };
    expect(cartsBody.data.items.length).toBeGreaterThan(0);

    const createCartRes = handleMockRequest('/api/v1/organizations/org-1/pos/carts', 'POST');
    expect(createCartRes?.status).toBe(201);

    const chkRes = handleMockRequest('/api/v1/organizations/org-1/pos/checkouts', 'POST');
    expect(chkRes?.status).toBe(201);
  });

  it('handles kitchen queue and dining tables', () => {
    const queueRes = handleMockRequest('/api/v1/organizations/org-1/restaurant/queue');
    expect(queueRes?.status).toBe(200);
    const queueBody = queueRes?.body as { data: Array<{ queue_number: string }> };
    expect(queueBody.data.length).toBeGreaterThan(0);

    const tablesRes = handleMockRequest('/api/v1/organizations/org-1/restaurant/tables');
    expect(tablesRes?.status).toBe(200);
    const tablesBody = tablesRes?.body as { data: Array<{ code: string }> };
    expect(tablesBody.data.length).toBeGreaterThan(0);

    const addTableRes = handleMockRequest('/api/v1/organizations/org-1/restaurant/tables', 'POST', {
      code: 'T99',
      name: 'โต๊ะภิมภะเบียฅ',
      seats: 4,
    });
    expect(addTableRes?.status).toBe(201);
  });

  it('handles online order tracking and status mutations', () => {
    const ordersRes = handleMockRequest('/api/v1/organizations/org-1/online-orders');
    expect(ordersRes?.status).toBe(200);
    const ordersBody = ordersRes?.body as { data: { items: Array<{ id: string; status: string }> } };
    expect(ordersBody.data.items.length).toBeGreaterThan(0);

    const firstId = ordersBody.data.items[0].id;
    const mutateRes = handleMockRequest(
      '/api/v1/organizations/org-1/online-orders/' + firstId + '/status',
      'PATCH',
      { status: 'READY' },
    );
    expect(mutateRes?.status).toBe(200);
    const mutateBody = mutateRes?.body as { data: { status: string } };
    expect(mutateBody.data.status).toBe('READY');
  });

  it('handles public storefront catalog and quote generation', () => {
    const storeRes = handleMockRequest('/api/v1/storefronts/main-store');
    expect(storeRes?.status).toBe(200);

    const prodsRes = handleMockRequest('/api/v1/storefronts/main-store/products');
    expect(prodsRes?.status).toBe(200);

    const quoteRes = handleMockRequest('/api/v1/storefronts/main-store/quote', 'POST', {
      items: [{ variant_id: 'var-basil', quantity: '2' }],
      fulfillment: 'PICKUP',
    });
    expect(quoteRes?.status).toBe(200);
    const quoteBody = quoteRes?.body as { data: { estimated_total: string } };
    expect(quoteBody.data.estimated_total).toBe('170.00');
  });
});
