import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { organizationRequest } from '../../lib/organization-api';
import type { CatalogPage, Taxonomy } from '../../lib/catalog-api';

export function useCatalog() {
  const { state } = useAuth();
  const tenant = useOrganization();
  const client = useQueryClient();
  const userID = state.session?.user.id ?? '';
  const orgID = tenant.context?.organization.id ?? '';
  const csrf = state.session?.csrf_token ?? '';
  const controller = useRef(new AbortController());
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, [userID, orgID]);
  const prefix = `/organizations/${orgID}`;
  const key = ['tenant', userID, orgID, 'catalog'];
  return {
    orgID,
    csrf,
    tenant,
    key,
    controller,
    request: <Result>(path: string, method = 'GET', body?: object) =>
      organizationRequest<Result>(prefix + path, {
        method,
        body,
        csrf,
        signal: controller.current.signal,
      }),
    refresh: () => client.invalidateQueries({ queryKey: key }),
  };
}
export function useCatalogQuery<Result>(path: string, enabled = true) {
  const catalog = useCatalog();
  return useQuery({
    queryKey: [...catalog.key, path],
    queryFn: ({ signal }) =>
      organizationRequest<Result>(`/organizations/${catalog.orgID}${path}`, {
        signal,
      }),
    enabled: !!catalog.orgID && enabled,
    retry: false,
  });
}
export function useTaxonomyOptions(kind: 'categories' | 'brands' | 'units') {
  const catalog = useCatalog();
  return useQuery({
    queryKey: [...catalog.key, kind, 'options'],
    enabled: !!catalog.orgID,
    retry: false,
    queryFn: async ({ signal }) => {
      const items: Taxonomy[] = [];
      let page = 1;
      let total: number;
      do {
        const result = await organizationRequest<CatalogPage<Taxonomy>>(
          `/organizations/${catalog.orgID}/${kind}?status=ACTIVE&page_size=100&page=${page}`,
          { signal },
        );
        items.push(...result.items);
        total = result.total;
        page++;
      } while (items.length < total && page <= 100);
      return items;
    },
  });
}
