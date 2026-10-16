import { useLanguage } from '../../app/language';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button, Card, Loading, Tag } from '../../components/ui/primitives';
import { Field } from '../purchasing/SupplyUI';
import {
  pricingRequest,
  type PriceDefinition,
  type PricingRule,
  type DiscountApproval,
} from '../../lib/pricing-api';
import type { Product, Variant, Taxonomy } from '../../lib/catalog-api';
import './pricing.css';

type View = 'overview' | 'lists' | 'promotions' | 'approvals';
function usePricingQuery<Result>(path: string, enabled = true) {
  const tenant = useOrganization(),
    { state } = useAuth(),
    org = tenant.context?.organization.id ?? '';
  return useQuery({
    queryKey: [
      'tenant',
      state.session?.user.id,
      org,
      tenant.branchID,
      'pricing',
      path,
    ],
    queryFn: ({ signal }) => pricingRequest<Result>(org, path, { signal }),
    enabled: !!org && enabled,
  });
}
function useCommand() {
  const tenant = useOrganization(),
    { state } = useAuth(),
    cache = useQueryClient(),
    org = tenant.context?.organization.id ?? '';
  return useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body: object;
      method?: string;
    }) =>
      pricingRequest<PriceDefinition | DiscountApproval>(org, path, {
        method,
        body,
        csrf: state.session?.csrf_token,
        key: crypto.randomUUID(),
      }),
    onSuccess: () => cache.invalidateQueries({ queryKey: ['tenant'] }),
  });
}
export function PricingPage({ view }: { view: View }) {
  const tenant = useOrganization(),
    { state } = useAuth();
  return (
    <PricingWorkspace
      key={[
        state.session?.user.id,
        tenant.context?.organization.id,
        tenant.branchID,
        view,
      ].join(':')}
      view={view}
    />
  );
}
function PricingWorkspace({ view }: { view: View }) {
  const { t, localize, labelCode } = useLanguage();
  const [selected, setSelected] = useState('');
  const { id } = useParams();
  const tenant = useOrganization();
  const lists = usePricingQuery<PriceDefinition[]>('/pricing/lists'),
    promotions = usePricingQuery<PriceDefinition[]>('/promotions');
  const data = view === 'promotions' ? promotions : lists;
  const chosen = data.data?.find((item) => item.id === (id ?? selected));
  return (
    <div className="catalog-page pricing-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('pricing.pricingPromotions')}</p>
          <h1>
            {view === 'approvals'
              ? t('pricing.discountApprovals')
              : view === 'promotions'
                ? t('pricing.promotions')
                : view === 'lists'
                  ? t('pricing.priceLists')
                  : t('pricing.pricingAndPromotions')}
          </h1>
          <p>
            {t('pricing.serverAuthoritativePricingThbImmutableSaleHistory')}
          </p>
        </div>
      </div>
      <nav className="catalog-nav">
        <Link to="/pricing">{t('inventory.overview')}</Link>
        <Link to="/pricing/lists">{t('pricing.priceLists')}</Link>
        <Link to="/promotions">{t('pricing.promotions')}</Link>
        <Link to="/discount-approvals">{t('pricing.discountApprovals')}</Link>
      </nav>
      {view === 'overview' ? (
        <>
          <div className="pricing-grid">
            <Card>
              <h2>{t('pricing.priceLists')}</h2>
              {lists.isPending ? (
                <Loading />
              ) : (
                <p>
                  {lists.data?.length ?? 0} {t('catalog.definitions')}
                </p>
              )}
            </Card>
            <Card>
              <h2>{t('pricing.promotions')}</h2>
              {promotions.isPending ? (
                <Loading />
              ) : (
                <p>
                  {promotions.data?.length ?? 0} {t('catalog.definitions')}
                </p>
              )}
            </Card>
          </div>
          <Card>
            <h2>{t('pricing.resolutionOrder')}</h2>
            <p>
              {t('pricing.branchOrganizationCatalogDescendingPriorityThenUuid')}
            </p>
            <p>{t('pricing.draftPendingApprovalApprovedActivePaused')}</p>
            <p>
              {t('pricing.compareOrderedStackableBundleWithSingleExclusive')}
            </p>
          </Card>
        </>
      ) : view === 'approvals' ? (
        <ApprovalQueue />
      ) : (
        <div className="pricing-grid">
          <Card>
            <h2>{t('pricing.savedDefinitions')}</h2>
            {data.isPending && <Loading />}
            {data.error && (
              <p role="alert">{localize(data.error.message ?? '')}</p>
            )}
            {data.data?.length === 0 && <p>{t('pricing.noDefinitionsYet')}</p>}
            {data.data?.map((item) => (
              <div className="pricing-record" key={item.id}>
                <button
                  className="pricing-select"
                  onClick={() => setSelected(item.id)}
                >
                  {item.name}
                </button>{' '}
                <Tag>{labelCode(item.status)}</Tag>
                <p>
                  {item.branch_id || t('pricing.organizationWide')}{' '}
                  {t('pricing.priority2')}
                  {item.priority} · r{item.revision}
                </p>
                {view === 'promotions' && (
                  <Link to={`/promotions/${item.id}`}>
                    {t('inventory.details')}
                  </Link>
                )}
              </div>
            ))}
            <Button onClick={() => setSelected('')}>
              {t('pricing.newDraft')}
            </Button>
          </Card>
          <Card>
            {id && !chosen && !data.isPending ? (
              <p role="alert">{t('pricing.promotionNotFoundOrInaccessible')}</p>
            ) : (
              <DefinitionEditor
                key={chosen ? [chosen.id, chosen.revision].join(':') : 'new'}
                promotion={view === 'promotions'}
                item={chosen}
                canManage={tenant.can(
                  view === 'promotions'
                    ? 'promotions.manage'
                    : 'pricing.manage',
                )}
              />
            )}
          </Card>
        </div>
      )}
      {view === 'overview' && (lists.error || promotions.error) && (
        <p role="alert">{(lists.error ?? promotions.error)?.message}</p>
      )}
    </div>
  );
}
function DefinitionEditor({
  promotion,
  item,
  canManage,
}: {
  promotion: boolean;
  item?: PriceDefinition;
  canManage: boolean;
}) {
  const { t, localize, labelCode } = useLanguage();

  const tenant = useOrganization(),
    command = useCommand();
  const [name, setName] = useState(item?.name ?? ''),
    [branch, setBranch] = useState(
      item?.branch_id ??
        (tenant.context?.membership.role === 'OWNER' ? '' : tenant.branchID),
    ),
    [priority, setPriority] = useState(item?.priority ?? 0),
    [start, setStart] = useState(item?.starts_at ?? ''),
    [end, setEnd] = useState(item?.ends_at ?? '');
  const [prices, setPrices] = useState(item?.items ?? []),
    [search, setSearch] = useState(''),
    [productID, setProductID] = useState(''),
    [variantID, setVariantID] = useState(''),
    [price, setPrice] = useState('');
  const [rule, setRule] = useState<PricingRule>(
    item?.rule ?? {
      type: 'PERCENTAGE',
      policy: 'EXCLUSIVE',
      basis_points: 1000,
      amount: '0.00',
      minimum_spend: '0.00',
      buy: 0,
      get: 0,
      variant_ids: [],
      category_ids: [],
      usage_limit: 0,
    },
  );
  const products = usePricingQuery<{ items: Product[] }>(
    `/products?search=${encodeURIComponent(search)}&page_size=25`,
  );
  const variants = usePricingQuery<Variant[]>(
    `/products/${productID}/variants`,
    !!productID,
  );
  const categories = usePricingQuery<{ items: Taxonomy[] }>(
    '/categories?page_size=100',
  );
  const path = promotion ? '/promotions' : '/pricing/lists';
  const permitted =
    canManage && (branch !== '' || tenant.context?.membership.role === 'OWNER');
  const editable = permitted && (!item || item.status === 'DRAFT');
  const changeRule = <Key extends keyof PricingRule>(
    key: Key,
    value: PricingRule[Key],
  ) => setRule((previous) => ({ ...previous, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    command.mutate({
      path: path + (item ? '/' + item.id : ''),
      method: item ? 'PUT' : 'POST',
      body: {
        name,
        branch_id: branch,
        priority,
        starts_at: start || null,
        ends_at: end || null,
        revision: item?.revision ?? 0,
        ...(promotion ? { rule } : { items: prices }),
      },
    });
  };
  return (
    <>
      <h2>{item?.name ?? t('pricing.createDraft')}</h2>
      <form className="pricing-form" onSubmit={submit}>
        <Field label={t('common.name')}>
          <input
            required
            maxLength={200}
            value={name}
            disabled={!editable}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label={t('organization.branch')}>
          <select
            value={branch}
            disabled={!editable || !!item}
            onChange={(event) => setBranch(event.target.value)}
          >
            {tenant.context?.membership.role === 'OWNER' && (
              <option value="">{t('pricing.organizationWide')}</option>
            )}
            {tenant.context?.branches.map((value) => (
              <option key={value.id} value={value.id}>
                {value.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('pricing.priority')}>
          <input
            type="number"
            min={-10000}
            max={10000}
            value={priority}
            disabled={!editable}
            onChange={(event) => setPriority(Number(event.target.value))}
          />
        </Field>
        <Field label={t('pricing.startsAtRfc3339WithTimezone')}>
          <input
            value={start}
            disabled={!editable}
            onChange={(event) => setStart(event.target.value)}
            placeholder="2026-10-10T09:00:00+07:00"
          />
        </Field>
        <Field label={t('pricing.endsAtRfc3339WithTimezone')}>
          <input
            value={end}
            disabled={!editable}
            onChange={(event) => setEnd(event.target.value)}
          />
        </Field>
        {promotion ? (
          <>
            <Field label={t('common.type')}>
              <select
                disabled={!editable}
                value={rule.type}
                onChange={(event) => {
                  const type = event.target.value as PricingRule['type'];
                  setRule({
                    ...rule,
                    type,
                    basis_points: type === 'PERCENTAGE' ? 1000 : 0,
                    amount: ['FIXED', 'MINIMUM_SPEND'].includes(type)
                      ? '1.00'
                      : '0.00',
                    minimum_spend:
                      type === 'MINIMUM_SPEND' ? '10.00' : rule.minimum_spend,
                    buy: type === 'BOGO' ? 1 : 0,
                    get: type === 'BOGO' ? 1 : 0,
                  });
                }}
              >
                {['PERCENTAGE', 'FIXED', 'BOGO', 'MINIMUM_SPEND'].map(
                  (value) => (
                    <option key={value} value={value}>
                      {labelCode(value)}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label={t('pricing.policy')}>
              <select
                disabled={!editable}
                value={rule.policy}
                onChange={(event) =>
                  changeRule(
                    'policy',
                    event.target.value as PricingRule['policy'],
                  )
                }
              >
                {['EXCLUSIVE', 'STACKABLE', 'BEST_DISCOUNT_ONLY'].map(
                  (value) => (
                    <option key={value} value={value}>
                      {labelCode(value)}
                    </option>
                  ),
                )}
              </select>
            </Field>
            {rule.type === 'PERCENTAGE' ? (
              <Field label={t('pricing.basisPoints1001')}>
                <input
                  type="number"
                  min={1}
                  max={10000}
                  value={rule.basis_points}
                  disabled={!editable}
                  onChange={(event) =>
                    changeRule('basis_points', Number(event.target.value))
                  }
                />
              </Field>
            ) : rule.type === 'BOGO' ? (
              <>
                <Field label={t('pricing.buyX')}>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={rule.buy}
                    disabled={!editable}
                    onChange={(event) =>
                      changeRule('buy', Number(event.target.value))
                    }
                  />
                </Field>
                <Field label={t('pricing.getY')}>
                  <input
                    type="number"
                    min={1}
                    max={1000}
                    value={rule.get}
                    disabled={!editable}
                    onChange={(event) =>
                      changeRule('get', Number(event.target.value))
                    }
                  />
                </Field>
              </>
            ) : (
              <Field label={t('pricing.discountThb')}>
                <input
                  inputMode="decimal"
                  value={rule.amount}
                  disabled={!editable}
                  onChange={(event) => changeRule('amount', event.target.value)}
                />
              </Field>
            )}
            <Field label={t('pricing.minimumSpendThb')}>
              <input
                value={rule.minimum_spend}
                inputMode="decimal"
                disabled={!editable}
                onChange={(event) =>
                  changeRule('minimum_spend', event.target.value)
                }
              />
            </Field>
            <Field label={t('pricing.usageLimit0Unlimited')}>
              <input
                type="number"
                min={0}
                max={Number.MAX_SAFE_INTEGER}
                value={rule.usage_limit}
                disabled={!editable}
                onChange={(event) =>
                  changeRule('usage_limit', Number(event.target.value))
                }
              />
            </Field>
            <Field label={t('pricing.categoriesNoneAll')}>
              <select
                multiple
                value={rule.category_ids}
                disabled={!editable}
                onChange={(event) =>
                  changeRule(
                    'category_ids',
                    Array.from(
                      event.target.selectedOptions,
                      (option) => option.value,
                    ),
                  )
                }
              >
                {categories.data?.items.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
        {editable && (
          <>
            <Field label={t('common.searchProducts')}>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </Field>
            <Field label={t('common.products')}>
              <select
                value={productID}
                onChange={(event) => {
                  setProductID(event.target.value);
                  setVariantID('');
                }}
              >
                <option value="">—</option>
                {products.data?.items.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Variant / SKU">
              <select
                value={variantID}
                onChange={(event) => setVariantID(event.target.value)}
              >
                <option value="">—</option>
                {variants.data?.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.sku} · {value.name}
                  </option>
                ))}
              </select>
            </Field>
            {!promotion && (
              <Field label={t('pricing.priceThb')}>
                <input
                  inputMode="decimal"
                  value={price}
                  onChange={(event) => setPrice(event.target.value)}
                />
              </Field>
            )}
            <Button
              type="button"
              disabled={!variantID || (!promotion && !price)}
              onClick={() => {
                if (promotion) {
                  changeRule('variant_ids', [
                    ...new Set([...rule.variant_ids, variantID]),
                  ]);
                } else {
                  setPrices((previous) => [
                    ...previous.filter(
                      (value) => value.variant_id !== variantID,
                    ),
                    { variant_id: variantID, unit_price: price },
                  ]);
                }
              }}
            >
              {t('catalog.addVariant')}
            </Button>
          </>
        )}
        <div className="pricing-span">
          {(promotion
            ? rule.variant_ids.map((value) => ({
                variant_id: value,
                unit_price: '',
              }))
            : prices
          ).map((value) => (
            <p className="pricing-record" key={value.variant_id}>
              {value.variant_id} {value.unit_price}{' '}
              {editable && (
                <Button
                  type="button"
                  onClick={() =>
                    promotion
                      ? changeRule(
                          'variant_ids',
                          rule.variant_ids.filter(
                            (id) => id !== value.variant_id,
                          ),
                        )
                      : setPrices(
                          prices.filter(
                            (item) => item.variant_id !== value.variant_id,
                          ),
                        )
                  }
                >
                  {t('catalog.remove')}
                </Button>
              )}
            </p>
          ))}
          {promotion && rule.variant_ids.length === 0 && (
            <p>{t('pricing.allVariantsMatchingCategories')}</p>
          )}
        </div>
        <Button
          type="submit"
          disabled={
            !editable ||
            command.isPending ||
            (!promotion && prices.length === 0)
          }
        >
          {t('pricing.saveDraft')}
        </Button>
      </form>
      {item && (
        <div className="catalog-actions">
          {(item.status === 'DRAFT'
            ? ['submit']
            : item.status === 'PENDING_APPROVAL'
              ? ['approve']
              : item.status === 'ACTIVE'
                ? ['pause']
                : ['activate']
          ).map((action) => (
            <Button
              key={action}
              disabled={
                command.isPending ||
                !permitted ||
                (action === 'approve' && !tenant.can('pricing.approve'))
              }
              onClick={() =>
                command.mutate({
                  path: `${path}/${item.id}/${action}`,
                  body: { revision: item.revision },
                })
              }
            >
              {labelCode(action)}
            </Button>
          ))}
        </div>
      )}
      {command.error && (
        <p role="alert">{localize(command.error.message ?? '')}</p>
      )}
      {command.isSuccess && (
        <p role="status">{t('pricing.savedSelectTheDefinitionToViewIts')}</p>
      )}
      {products.error && (
        <p role="alert">{localize(products.error.message ?? '')}</p>
      )}
    </>
  );
}
function ApprovalQueue() {
  const { t, localize, formatDateTime, labelCode } = useLanguage();

  const query = usePricingQuery<DiscountApproval[]>('/discount-approvals'),
    command = useCommand(),
    tenant = useOrganization();
  return (
    <Card>
      <h2>{t('pricing.approvalQueue')}</h2>
      <p>{t('pricing.requestFromTheCurrentPosCartApproval')}</p>
      <Link to="/pos/checkout">{t('pricing.posCheckout')}</Link>
      {query.isPending && <Loading />}
      {query.error && <p role="alert">{localize(query.error.message ?? '')}</p>}
      {query.data?.length === 0 && <p>{t('pricing.noRequests')}</p>}
      {query.data?.map((item) => (
        <section key={item.id} className="pricing-record">
          <h3>
            {item.amount} THB <Tag>{labelCode(item.status)}</Tag>
          </h3>
          <p>{item.reason}</p>
          <p>
            {t('pricing.cart')} {item.cart_id} · r{item.cart_revision}
          </p>
          <p>
            {t('pricing.expires')}: {formatDateTime(item.expires_at)}
          </p>
          {item.status === 'PENDING' && tenant.can('discount.approve') && (
            <div className="catalog-actions">
              {['approve', 'reject'].map((action) => (
                <Button
                  key={action}
                  disabled={command.isPending}
                  onClick={() =>
                    command.mutate({
                      path: `/discount-approvals/${item.id}/${action}`,
                      body: { revision: item.revision },
                    })
                  }
                >
                  {labelCode(action)}
                </Button>
              ))}
            </div>
          )}
        </section>
      ))}
      {command.error && (
        <p role="alert">{localize(command.error.message ?? '')}</p>
      )}
    </Card>
  );
}
