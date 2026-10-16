import { useLanguage } from '../../app/language';
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
  const { t } = useLanguage();

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
    <section className="customer-picker" aria-label={t('customers.customer2')}>
      <h3>{t('customers.customer2')}</h3>
      {cart.customer ? (
        <div>
          <p>
            <strong>{cart.customer.code}</strong> {cart.customer.name}
          </p>
          {cart.customer.status === 'ARCHIVED' && (
            <p role="alert">
              {t('customers.archivedCustomerRemoveBeforeCheckout')}
            </p>
          )}
          <Button disabled={pos.busy} onClick={() => void select(null)}>
            {t('customers.remove')}
          </Button>
        </div>
      ) : (
        <p>{t('customers.walkInCustomerNoAccountOrContact')}</p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setTerm(search.trim());
        }}
      >
        <label>
          {t('customers.findCustomer')}
          <input
            value={search}
            maxLength={200}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('customers.codeNamePhoneEmail')}
          />
        </label>
        <Button type="submit" disabled={pos.busy || !search.trim()}>
          {t('customers.search')}
        </Button>
      </form>
      {results.isFetching && <Loading>{t('customers.searching')}</Loading>}
      {results.error && (
        <p role="alert">
          {t('customers.searchUnavailable')}{' '}
          <Button onClick={() => void results.refetch()}>
            {t('customers.retry')}
          </Button>
        </p>
      )}
      {term && results.data?.total === 0 && (
        <p>{t('customers.noCustomersFound')}</p>
      )}
      {results.data?.items.map((item) => (
        <Button
          className="button-secondary customer-pick-result"
          key={item.id}
          disabled={pos.busy}
          onClick={() => void select(item.id)}
        >
          {item.code} · {item.name || t('customers.unnamed')} · {item.phone}
        </Button>
      ))}
      {results.data && results.data.total > 10 && (
        <div className="customer-pagination">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            {t('catalog.previous')}
          </Button>
          <span>{page}</span>
          <Button
            disabled={page * 10 >= results.data.total}
            onClick={() => setPage(page + 1)}
          >
            {t('catalog.next')}
          </Button>
        </div>
      )}
    </section>
  );
}
