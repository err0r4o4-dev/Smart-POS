import type { OnlineOrder, OrderStatus } from '../lib/storefront-api';
import {
  MOCK_SESSION,
  MOCK_USER,
  MOCK_ORGANIZATION,
  MOCK_BRANCH,
  MOCK_CONTEXT,
  MOCK_UNITS,
  MOCK_CATEGORIES,
  MOCK_BRANDS,
  MOCK_PRODUCTS,
  MOCK_TERMINALS,
  MOCK_SHIFTS,
  MOCK_HELD_CARTS,
  MOCK_SALES,
  MOCK_RECEIPTS,
  MOCK_REFUNDS,
  MOCK_QUEUE,
  MOCK_ONLINE_ORDERS,
  MOCK_TABLES,
  MOCK_RESTAURANT_SETTINGS,
  MOCK_SETUP_STATE,
  MOCK_STOREFRONT,
} from './mock-data';

export interface MockResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

// In-memory state for mock sessions & mutations
const state = {
  queue: [...MOCK_QUEUE],
  onlineOrders: [...MOCK_ONLINE_ORDERS],
  tables: [...MOCK_TABLES],
  products: [...MOCK_PRODUCTS],
  shifts: [...MOCK_SHIFTS],
  sales: [...MOCK_SALES],
  refunds: [...MOCK_REFUNDS],
  heldCarts: [...MOCK_HELD_CARTS],
  storefrontSettings: { ...MOCK_STOREFRONT },
  restaurantSettings: { ...MOCK_RESTAURANT_SETTINGS },
};

export function resetMockState() {
  state.queue = [...MOCK_QUEUE];
  state.onlineOrders = [...MOCK_ONLINE_ORDERS];
  state.tables = [...MOCK_TABLES];
  state.products = [...MOCK_PRODUCTS];
  state.shifts = [...MOCK_SHIFTS];
  state.sales = [...MOCK_SALES];
  state.refunds = [...MOCK_REFUNDS];
  state.heldCarts = [...MOCK_HELD_CARTS];
  state.storefrontSettings = { ...MOCK_STOREFRONT };
  state.restaurantSettings = { ...MOCK_RESTAURANT_SETTINGS };
}

export function handleMockRequest(
  urlStr: string,
  method = 'GET',
  reqBody?: unknown,
): MockResponse | null {
  const url = new URL(urlStr, 'http://localhost');
  const pathname = url.pathname;
  const searchParams = url.searchParams;

  // 1. System Readiness
  if (pathname === '/health/ready' || pathname === '/health') {
    return { status: 200, body: { status: 'ready' } };
  }

  // 2. Authentication
  if (pathname === '/api/v1/auth/me') {
    return { status: 200, body: { data: MOCK_SESSION } };
  }
  if (pathname === '/api/v1/auth/login') {
    return { status: 200, body: { data: MOCK_SESSION } };
  }
  if (pathname === '/api/v1/auth/logout') {
    return { status: 200, body: { data: { revoked: true } } };
  }
  if (pathname === '/api/v1/auth/register') {
    return { status: 200, body: { data: MOCK_USER } };
  }
  if (pathname === '/api/v1/auth/forgot-password' || pathname === '/api/v1/auth/reset-password') {
    return { status: 200, body: { data: { message: 'สำเร็จ' } } };
  }

  // 3. Organization & Workspaces
  if (pathname === '/api/v1/organizations') {
    return {
      status: 200,
      headers: { 'X-Store-Mode': 'single' },
      body: { data: [MOCK_ORGANIZATION] },
    };
  }
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/context$/)) {
    return { status: 200, body: { data: MOCK_CONTEXT } };
  }
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/branches$/)) {
    return { status: 200, body: { data: [MOCK_BRANCH] } };
  }
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/members$/)) {
    return { status: 200, body: { data: [MOCK_CONTEXT.membership] } };
  }

  // 4. Products & Catalog
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/products$/)) {
    const search = (searchParams.get('search') ?? '').trim().toLowerCase();
    const category = searchParams.get('category');
    const filtered = state.products.filter((p) => {
      if (search && !p.name.toLowerCase().includes(search)) return false;
      if (category && p.category_id !== category) return false;
      return true;
    });
    return {
      status: 200,
      body: {
        data: {
          items: filtered,
          total: filtered.length,
          page: 1,
          page_size: 20,
        },
      },
    };
  }

  const productMatch = pathname.match(/^\/api\/v1\/organizations\/[^/]+\/products\/([^/]+)$/);
  if (productMatch) {
    const prodId = productMatch[1];
    const found = state.products.find((p) => p.id === prodId) ?? state.products[0];
    return { status: 200, body: { data: found } };
  }

  // 5. Categories, Units, Brands
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/categories$/)) {
    return {
      status: 200,
      body: {
        data: {
          items: MOCK_CATEGORIES,
          total: MOCK_CATEGORIES.length,
          page: 1,
          page_size: 100,
        },
      },
    };
  }
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/units$/)) {
    return {
      status: 200,
      body: {
        data: {
          items: MOCK_UNITS,
          total: MOCK_UNITS.length,
          page: 1,
          page_size: 100,
        },
      },
    };
  }
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/brands$/)) {
    return {
      status: 200,
      body: {
        data: {
          items: MOCK_BRANDS,
          total: MOCK_BRANDS.length,
          page: 1,
          page_size: 100,
        },
      },
    };
  }

  // 6. POS Terminals & Shifts
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/pos\/terminals$/)) {
    return {
      status: 200,
      body: {
        data: {
          items: MOCK_TERMINALS,
          total: MOCK_TERMINALS.length,
          page: 1,
          page_size: 20,
        },
      },
    };
  }
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/pos\/shifts$/)) {
    const statusFilter = searchParams.get('status');
    const items = statusFilter
      ? state.shifts.filter((s) => s.status === statusFilter)
      : state.shifts;
    return {
      status: 200,
      body: {
        data: {
          items,
          total: items.length,
          page: 1,
          page_size: 20,
        },
      },
    };
  }

  // 7. POS Carts & Held Carts
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/pos\/carts$/)) {
    if (method === 'POST') {
      const newCart = {
        id: `cart-${Date.now()}`,
        branch_id: MOCK_BRANCH.id,
        terminal_id: 'term-main',
        cashier_id: MOCK_USER.id,
        status: 'ACTIVE',
        revision: 1,
        items: [],
        total: '0.00',
        stock_policy: 'MENU_ONLY' as const,
      };
      return { status: 201, body: { data: newCart } };
    }
    const statusFilter = searchParams.get('status');
    const items = statusFilter === 'HELD' ? state.heldCarts : [];
    return {
      status: 200,
      body: {
        data: {
          items,
          total: items.length,
          page: 1,
          page_size: 20,
        },
      },
    };
  }

  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/pos\/carts\/[^/]+$/)) {
    if (method === 'DELETE') {
      return { status: 200, body: { data: { cancelled: true } } };
    }
    return {
      status: 200,
      body: {
        data: {
          id: 'cart-active',
          branch_id: MOCK_BRANCH.id,
          terminal_id: 'term-main',
          cashier_id: MOCK_USER.id,
          status: 'ACTIVE',
          revision: 1,
          items: [],
          total: '0.00',
          stock_policy: 'MENU_ONLY',
        },
      },
    };
  }

  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/pos\/checkouts$/)) {
    return {
      status: 201,
      body: {
        data: {
          id: `chk-${Date.now()}`,
          status: 'COMPLETED',
          change: '0.00',
          total: '100.00',
        },
      },
    };
  }

  // 8. Sales & Receipts
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/sales$/)) {
    const search = searchParams.get('search')?.toLowerCase() ?? '';
    const filtered = search
      ? state.sales.filter((s) => s.sale_number.toLowerCase().includes(search))
      : state.sales;
    return {
      status: 200,
      body: {
        data: {
          items: filtered,
          total: filtered.length,
          page: 1,
          page_size: 20,
        },
      },
    };
  }

  const saleMatch = pathname.match(/^\/api\/v1\/organizations\/[^/]+\/sales\/([^/]+)$/);
  if (saleMatch) {
    const saleId = saleMatch[1];
    const found =
      state.sales.find((s) => s.id === saleId || s.sale_number === saleId) ??
      state.sales[0];
    return { status: 200, body: { data: found } };
  }

  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/receipts$/)) {
    return {
      status: 200,
      body: {
        data: {
          items: MOCK_RECEIPTS,
          total: MOCK_RECEIPTS.length,
          page: 1,
          page_size: 20,
        },
      },
    };
  }

  // 9. Refunds & Returns
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/refunds$/)) {
    return {
      status: 200,
      body: {
        data: {
          items: state.refunds,
          total: state.refunds.length,
          page: 1,
          page_size: 20,
        },
      },
    };
  }
  const refundMatch = pathname.match(/^\/api\/v1\/organizations\/[^/]+\/refunds\/([^/]+)$/);
  if (refundMatch) {
    const refId = refundMatch[1];
    const found =
      state.refunds.find((r) => r.id === refId || r.reference === refId) ??
      state.refunds[0];
    return { status: 200, body: { data: found } };
  }
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/returns$/)) {
    return {
      status: 200,
      body: {
        data: {
          items: [],
          total: 0,
          page: 1,
          page_size: 20,
        },
      },
    };
  }

  // 10. Kitchen Queue (KDS)
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/restaurant\/queue$/)) {
    return { status: 200, body: { data: state.queue } };
  }

  // 11. Restaurant Tables
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/restaurant\/tables$/)) {
    if (method === 'POST') {
      const input = (reqBody as { code?: string; name?: string; seats?: number }) ?? {};
      const newTable = {
        id: `tbl-${Date.now()}`,
        branch_id: MOCK_BRANCH.id,
        code: input.code ?? 'T99',
        name: input.name ?? 'โต๊ะใหม่',
        seats: input.seats ?? 4,
        status: 'ACTIVE',
        revision: 1,
        qr_token: `token-${Date.now()}`,
      };
      state.tables.push(newTable);
      return { status: 201, body: { data: newTable } };
    }
    return { status: 200, body: { data: state.tables } };
  }

  const tableItemMatch = pathname.match(
    /^\/api\/v1\/organizations\/[^/]+\/restaurant\/tables\/([^/]+)$/,
  );
  if (tableItemMatch) {
    const tableId = tableItemMatch[1];
    const found = state.tables.find((t) => t.id === tableId) ?? state.tables[0];
    if (method === 'PUT' && reqBody) {
      Object.assign(found, reqBody, { revision: found.revision + 1 });
    }
    return { status: 200, body: { data: found } };
  }

  // 12. Restaurant Settings & Setup
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/restaurant\/settings$/)) {
    if (method === 'PATCH' && reqBody) {
      Object.assign(state.restaurantSettings, reqBody);
    }
    return { status: 200, body: { data: state.restaurantSettings } };
  }
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/restaurant\/setup$/)) {
    return { status: 200, body: { data: MOCK_SETUP_STATE } };
  }

  // 13. Online Orders
  if (pathname.match(/^\/api\/v1\/organizations\/[^/]+\/online-orders$/)) {
    const statusFilter = searchParams.get('status');
    const items = statusFilter
      ? state.onlineOrders.filter((o) => o.status === statusFilter)
      : state.onlineOrders;
    return {
      status: 200,
      body: {
        data: {
          items,
          total: items.length,
          page: 1,
          page_size: 20,
        },
      },
    };
  }

  const orderMatch = pathname.match(
    /^\/api\/v1\/organizations\/[^/]+\/online-orders\/([^/]+)$/,
  );
  if (orderMatch) {
    const orderId = orderMatch[1];
    const found =
      state.onlineOrders.find((o) => o.id === orderId || o.number === orderId) ??
      state.onlineOrders[0];
    return { status: 200, body: { data: found } };
  }

  const orderStatusMatch = pathname.match(
    /^\/api\/v1\/organizations\/[^/]+\/online-orders\/([^/]+)\/status$/,
  );
  if (orderStatusMatch) {
    const orderId = orderStatusMatch[1];
    const found =
      state.onlineOrders.find((o) => o.id === orderId || o.number === orderId) ??
      state.onlineOrders[0];
    const input = (reqBody as { status?: OrderStatus }) ?? {};
    if (input.status && found) {
      found.status = input.status;
      found.events.push({
        status: input.status,
        message: `ปรับสถานะเป็น ${input.status}`,
        created_at: new Date().toISOString(),
      });
    }
    return { status: 200, body: { data: found } };
  }

  // 14. Storefront Settings & Public Storefront
  if (
    pathname.match(/^\/api\/v1\/organizations\/[^/]+\/storefront\/settings$/) ||
    pathname.match(/^\/api\/v1\/organizations\/[^/]+\/settings\/storefront$/)
  ) {
    if (method === 'PUT' && reqBody) {
      Object.assign(state.storefrontSettings, reqBody);
    }
    return { status: 200, body: { data: state.storefrontSettings } };
  }

  if (pathname === '/api/v1/storefronts') {
    return { status: 200, body: { data: [state.storefrontSettings] } };
  }

  if (pathname.match(/^\/api\/v1\/storefronts\/[^/]+$/)) {
    return { status: 200, body: { data: state.storefrontSettings } };
  }

  if (pathname.match(/^\/api\/v1\/storefronts\/[^/]+\/products$/)) {
    const shopProducts = state.products.flatMap((p) =>
      p.variants.map((v) => ({
        variant_id: v.id,
        product_name: p.name,
        variant_name: v.name,
        sku: v.sku,
        unit: MOCK_UNITS.find((u) => u.id === v.unit_id)?.name ?? 'หน่วย',
        unit_type: 'COUNT',
        unit_price: v.selling_price,
        available: v.available,
        saleable: true,
        published: true,
        category_id: p.category_id,
        description: p.description,
      })),
    );
    const shopCategories = MOCK_CATEGORIES.map((c) => ({
      id: c.id,
      name: c.name,
      count: state.products.filter((p) => p.category_id === c.id).length,
    }));
    return {
      status: 200,
      body: {
        data: {
          items: shopProducts,
          total: shopProducts.length,
          page: 1,
          page_size: 24,
          categories: shopCategories,
        },
      },
    };
  }

  if (pathname.match(/^\/api\/v1\/storefronts\/[^/]+\/quote$/)) {
    const input = (reqBody as { items?: { variant_id: string; quantity: string }[]; fulfillment?: string }) ?? {};
    const items = (input.items ?? []).map((item) => {
      const prod = state.products.find((p) => p.variants.some((v) => v.id === item.variant_id));
      const variant = prod?.variants.find((v) => v.id === item.variant_id);
      const qty = parseFloat(item.quantity) || 1;
      const price = parseFloat(variant?.selling_price ?? '85.00');
      return {
        variant_id: item.variant_id,
        product_name: prod?.name ?? 'อาหาร',
        variant_name: variant?.name ?? 'ปกติ',
        sku: variant?.sku ?? 'FOOD',
        unit: 'จาน',
        quantity: item.quantity,
        unit_price: (variant?.selling_price ?? '85.00'),
        line_total: (qty * price).toFixed(2),
      };
    });
    const subtotal = items.reduce((sum, it) => sum + parseFloat(it.line_total), 0);
    const shipping = input.fulfillment === 'DELIVERY' ? 35.0 : 0.0;
    const total = (subtotal + shipping).toFixed(2);
    return {
      status: 200,
      body: {
        data: {
          quote_id: `quote-${Date.now()}`,
          items,
          subtotal: subtotal.toFixed(2),
          shipping_fee: shipping.toFixed(2),
          estimated_total: total,
          currency: 'THB',
        },
      },
    };
  }

  if (pathname.match(/^\/api\/v1\/storefronts\/[^/]+\/orders$/)) {
    const input = (reqBody as { customer_name?: string; contact_phone?: string; fulfillment?: string }) ?? {};
    const createdOrder: OnlineOrder = {
      id: `ord-${Date.now()}`,
      number: `WEB-${Math.floor(1000 + Math.random() * 9000)}`,
      status: 'PENDING',
      payment_status: 'PAID_AT_STORE',
      customer_name: input.customer_name ?? 'ลูกค้าออนไลน์',
      contact_phone: input.contact_phone ?? '081-234-5678',
      customer_note: '',
      store_name: state.storefrontSettings.name,
      store_phone: '02-123-4567',
      pickup_instructions: state.storefrontSettings.pickup_instructions,
      estimated_total: '180.00',
      final_total: null,
      receipt_number: null,
      revision: 1,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      stock_policy: 'MENU_ONLY',
      items: [
        {
          variant_id: 'var-basil',
          product_name: 'ข้าวกะเพราหมูกรอบไข่ดาว',
          variant_name: 'จานธรรมดา',
          sku: 'FOOD-BASIL-PORK',
          unit: 'จาน',
          quantity: '1.000',
          unit_price: '85.00',
          line_total: '85.00',
        },
        {
          variant_id: 'var-padthai',
          product_name: 'ผัดไทยกุ้งสด',
          variant_name: 'จานธรรมดา',
          sku: 'FOOD-PADTHAI-SHRIMP',
          unit: 'จาน',
          quantity: '1.000',
          unit_price: '95.00',
          line_total: '95.00',
        },
      ],
      events: [
        { status: 'PENDING', message: 'สร้างออเดอร์เรียบร้อย', created_at: new Date().toISOString() },
      ],
    };
    state.onlineOrders.unshift(createdOrder);
    return { status: 201, body: { data: createdOrder } };
  }

  const trackMatch = pathname.match(/^\/api\/v1\/storefronts\/[^/]+\/track\/([^/]+)$/);
  if (trackMatch) {
    const orderId = trackMatch[1];
    const found =
      state.onlineOrders.find((o) => o.id === orderId || o.number === orderId) ??
      state.onlineOrders[0];
    return { status: 200, body: { data: found } };
  }

  // Fallback for unhandled /api/v1 endpoints
  if (pathname.startsWith('/api/v1/')) {
    return { status: 200, body: { data: { success: true } } };
  }

  return null;
}