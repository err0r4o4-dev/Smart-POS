import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePOS } from '../pos/POSContext';
import { Button, Loading } from '../../components/ui/primitives';
import {
  customerRequest,
  type Customer,
  type CustomerPage,
} from '../../lib/customers-api';
import './customers.css';

export function CustomerPicker() {
  const pos = usePOS();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const results = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      pos.branch,
      'customers',
      'picker',
      pos.can('customers.manage'),
      term,
      page,
    ],
    queryFn: ({ signal }) =>
      customerRequest<CustomerPage<Customer>>(pos.org, '/customers/search', {
        method: 'POST',
        csrf: pos.csrf,
        body: { search: term, status: 'ACTIVE', page, page_size: 10 },
        signal,
      }),
    enabled: !!term && !!pos.cart && pos.can('customers.select'),
  });
  if (!pos.can('customers.select') || !pos.cart) return null;
  const cart = pos.cart;
  const select = async (id: string | null) => {
    const result = await pos.mutate(
      `/pos/carts/${cart.id}/customer`,
      { revision: cart.revision, customer_id: id },
      'PATCH',
    );
    if (result) {
      setSearch('');
      setTerm('');
      setPage(1);
    }
  };
  return (
    <section className="customer-picker" aria-label="ลูกค้า / Customer">
      <h3>ลูกค้า / Customer</h3>
      {cart.customer ? (
        <div>
          <p>
            <strong>{cart.customer.code}</strong> {cart.customer.name}
          </p>
          {cart.customer.status === 'ARCHIVED' && (
            <p role="alert">
              ลูกค้าถูกเก็บถาวร — นำออกก่อนชำระเงิน / Archived customer
            </p>
          )}
          <Button disabled={pos.busy} onClick={() => void select(null)}>
            นำลูกค้าออก / Remove
          </Button>
        </div>
      ) : (
        <p>ลูกค้าทั่วไป / Walk-in — ไม่ต้องมีบัญชีหรือข้อมูลติดต่อ</p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setTerm(search.trim());
        }}
      >
        <label>
          ค้นหาลูกค้า / Find customer
          <input
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="รหัส / ชื่อ / โทรศัพท์ / อีเมล"
          />
        </label>
        <Button type="submit" disabled={pos.busy || !search.trim()}>
          ค้นหา / Search
        </Button>
      </form>
      {results.isFetching && <Loading>กำลังค้นหา / Searching</Loading>}
      {results.error && (
        <p role="alert">
          ค้นหาไม่สำเร็จ / Search unavailable{' '}
          <Button onClick={() => void results.refetch()}>
            ลองใหม่ / Retry
          </Button>
        </p>
      )}
      {term && results.data?.total === 0 && (
        <p>ไม่พบลูกค้า / No customers found</p>
      )}
      {results.data?.items.map((item) => (
        <Button
          className="button-secondary customer-pick-result"
          key={item.id}
          disabled={pos.busy}
          onClick={() => void select(item.id)}
        >
          {item.code} · {item.name || 'ไม่ระบุชื่อ / Unnamed'} · {item.phone}
        </Button>
      ))}
      {results.data && results.data.total > 10 && (
        <div className="customer-pagination">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            ก่อนหน้า / Previous
          </Button>
          <span>{page}</span>
          <Button
            disabled={page * 10 >= results.data.total}
            onClick={() => setPage(page + 1)}
          >
            ถัดไป / Next
          </Button>
        </div>
      )}
    </section>
  );
}
