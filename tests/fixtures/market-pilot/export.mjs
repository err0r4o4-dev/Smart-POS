import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { buildSetupBodies, renderPreview, validateCatalog } from './catalog.mjs';

const fixture = name => new URL('./' + name, import.meta.url);
const output = new URL('../../../.local/market-pilot/', import.meta.url);
const catalog = validateCatalog(
  await readFile(fixture('shops.json'), 'utf8'),
  await readFile(fixture('menu.tsv'), 'utf8'),
);
const setup = buildSetupBodies(catalog);
const menuOutput = new URL('./setup-menu/', output);
await mkdir(menuOutput, { recursive: true });
for (const [slug, payload] of Object.entries(setup)) {
  await writeFile(new URL('./' + slug + '.json', menuOutput), JSON.stringify(payload, null, 2) + '\n');
}
await writeFile(new URL('./preview.html', output), renderPreview(catalog));
await writeFile(new URL('./catalog.json', output), JSON.stringify(catalog, null, 2) + '\n');
await writeFile(new URL('./asset-briefs.json', output), JSON.stringify(
  catalog.shops.flatMap(shop => [
    { type: 'cover', id: shop.slug, prompt: shop.imageBrief },
    ...shop.items.map(item => ({ type: 'menu-photo', id: item.sku, prompt: item.imageBrief })),
  ]), null, 2) + '\n');
console.log('Exported 12 setup bodies, 192 image briefs and an offline preview to .local/market-pilot/.');
