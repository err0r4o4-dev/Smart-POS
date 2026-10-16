import { auth } from './auth';
import { catalog } from './catalog';
import { common } from './common';
import { customers } from './customers';
import { dashboard } from './dashboard';
import { help } from './help';
import { inventory } from './inventory';
import { landing } from './landing';
import { loyalty } from './loyalty';
import { organization } from './organization';
import { pos } from './pos';
import { pricing } from './pricing';
import { purchasing } from './purchasing';
import { quality } from './quality';
import { returns } from './returns';
import { shell } from './shell';
import { storefront } from './storefront';
import { system } from './system';
import { workspace } from './workspace';
import { legacyLabels } from './legacy';
import { shared } from './shared';
import { returnOperations } from './returnOperations';
import { adjustmentOperations } from './adjustmentOperations';
import { statuses } from './statuses';
export type Language = 'th' | 'en';
export const messages = {
  th: {
    statuses: statuses.th,
    returnOperations: returnOperations.th,
    adjustmentOperations: adjustmentOperations.th,
    auth: auth.th,
    catalog: catalog.th,
    common: common.th,
    customers: customers.th,
    dashboard: dashboard.th,
    help: help.th,
    inventory: inventory.th,
    landing: landing.th,
    loyalty: loyalty.th,
    organization: organization.th,
    pos: pos.th,
    pricing: pricing.th,
    purchasing: purchasing.th,
    quality: quality.th,
    returns: returns.th,
    shell: shell.th,
    storefront: storefront.th,
    system: system.th,
    workspace: workspace.th,
    shared: shared.th,
  },
  en: {
    statuses: statuses.en,
    returnOperations: returnOperations.en,
    adjustmentOperations: adjustmentOperations.en,
    auth: auth.en,
    catalog: catalog.en,
    common: common.en,
    customers: customers.en,
    dashboard: dashboard.en,
    help: help.en,
    inventory: inventory.en,
    landing: landing.en,
    loyalty: loyalty.en,
    organization: organization.en,
    pos: pos.en,
    pricing: pricing.en,
    purchasing: purchasing.en,
    quality: quality.en,
    returns: returns.en,
    shell: shell.en,
    storefront: storefront.en,
    system: system.en,
    workspace: workspace.en,
    shared: shared.en,
  },
};

type LeafKeys<T> = {
  [K in keyof T & string]: T[K] extends string ? K : `${K}.${LeafKeys<T[K]>}`;
}[keyof T & string];
export type TranslationKey = LeafKeys<typeof messages.th>;
export type TranslationParams = Record<string, string | number>;
export type UiMessage =
  string | { key: TranslationKey; params?: TranslationParams };

const sourceKeys = new Map<string, TranslationKey>();
function indexSources(resource: object, prefix = '') {
  for (const [key, value] of Object.entries(resource)) {
    const full = prefix ? prefix + '.' + key : key;
    if (typeof value === 'string') {
      if (!sourceKeys.has(value)) sourceKeys.set(value, full as TranslationKey);
    } else if (value && typeof value === 'object') indexSources(value, full);
  }
}
for (const resource of Object.values(messages)) indexSources(resource);
for (const [source, key] of Object.entries(legacyLabels))
  sourceKeys.set(source, key);

// Use only for UI-owned legacy metadata/errors, never for product or customer data.
export function localize(language: Language, value: string) {
  const key = sourceKeys.get(value);
  return key ? translate(language, key) : value;
}

function lookup(resource: object, key: string): string | undefined {
  let value: unknown = resource;
  for (const part of key.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, part))
      return;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function translate(
  language: Language,
  key: TranslationKey,
  params: TranslationParams = {},
) {
  const template =
    lookup(messages[language], key) ?? lookup(messages.th, key) ?? key;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    String(params[name] ?? match),
  );
}
