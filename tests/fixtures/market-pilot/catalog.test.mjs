import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateCatalog, buildSetupBodies, renderPreview } from './catalog.mjs';
import { readFile } from 'node:fs/promises';

const data = async () => validateCatalog(
  await readFile(new URL('./shops.json', import.meta.url), 'utf8'),
  await readFile(new URL('./menu.tsv', import.meta.url), 'utf8'),
);

test('approved pilot has 12 distinct categories, 180 named menu items and 192 image briefs', async () => {
  const { shops } = await data();
  assert.equal(new Set(shops.map(shop => shop.category)).size, 12);
  assert.equal(shops.length, 12);
  const items = shops.flatMap(shop => shop.items);
  assert.equal(items.length, 180);
  assert.equal(new Set(items.map(item => item.sku)).size, 180);
  const briefs = [...shops.map(shop => shop.imageBrief), ...items.map(item => item.imageBrief)];
  assert.equal(new Set(briefs).size, 192);
  assert.ok(items.every(item => Number.isSafeInteger(item.priceMinor) && item.priceMinor > 0));
});

test('setup export preserves exact THB and excludes profile-only and ungenerated fields', async () => {
  const setup = buildSetupBodies(await data());
  assert.equal(Object.keys(setup).length, 12);
  const jok = setup['market-jok-tee-ha'];
  assert.deepEqual(jok.items.find(item => item.sku === 'MKT-JOK-01'), {
    sku: 'MKT-JOK-01', name: 'โจ๊กหมูเด้ง', category: 'โจ๊ก', price: '45.00',
  });
  assert.deepEqual(Object.keys(jok).sort(), ['categories', 'items']);
});

test('cross-shop scenario references are rejected rather than silently joined', async () => {
  const raw = JSON.parse(await readFile(new URL('./shops.json', import.meta.url), 'utf8'));
  raw.scenarios[0].lines[0].sku = 'MKT-CAFE-01';
  const menu = await readFile(new URL('./menu.tsv', import.meta.url), 'utf8');
  assert.throws(() => validateCatalog(JSON.stringify(raw), menu), /scenario.*SKU/i);
});

test('rejects a mismatched scenario total and duplicate SKU', async () => {
  const profiles = await readFile(new URL('./shops.json', import.meta.url), 'utf8');
  const raw = JSON.parse(profiles);
  raw.scenarios[0].totalMinor += 1;
  const menu = await readFile(new URL('./menu.tsv', import.meta.url), 'utf8');
  assert.throws(() => validateCatalog(JSON.stringify(raw), menu), /scenario.*total/i);
  assert.throws(() => validateCatalog(profiles, `${menu.trimEnd()}\n${menu.trim().split('\n')[1]}\n`), /duplicate SKU/i);
});

test('preview is labeled offline and escapes catalog text without external references', async () => {
  const catalog = await data();
  catalog.shops[0].name = '<img src=x onerror=alert(1)>';
  const html = renderPreview(catalog);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img|<script|https?:\/\//);
  assert.match(html, /หน้าตรวจข้อมูลแบบออฟไลน์/);
});
