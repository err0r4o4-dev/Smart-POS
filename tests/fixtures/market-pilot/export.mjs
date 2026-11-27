import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { buildSetupBodies, renderPreview, validateCatalog } from './catalog.mjs';

const fixture = name => new URL('./' + name, import.meta.url);
const output = new URL('../../../.local/market-pilot/', import.meta.url);
const catalog = validateCatalog(
  await readFile(fixture('shops.json'), 'utf8'),
  await readFile(fixture('menu.tsv'), 'utf8'),
);
const setup = buildSetupBodies(catalog);
const coverOutput = new URL('./covers/', output);
const files = await readdir(coverOutput, { withFileTypes: true }).catch(error => {
  if (error.code === 'ENOENT') return [];
  throw error;
});
const covers = new Map();
for (const shop of catalog.shops) {
  const candidates = files.filter(file => file.isFile() &&
    ['webp', 'png', 'jpg'].some(ext => file.name === `${shop.slug}.${ext}`));
  if (candidates.length === 0) continue;
  if (candidates.length > 1) throw new Error(`Multiple covers for ${shop.slug}`);
  const filename = candidates[0].name;
  const ext = filename.split('.').at(-1);
  const bytes = await readFile(new URL(filename, coverOutput));
  const valid = {
    webp: bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP',
    png: bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    jpg: bytes.subarray(0, 3).toString('hex') === 'ffd8ff',
  };
  if (!valid[ext]) throw new Error(`Invalid cover file: ${filename}`);
  covers.set(shop.slug, `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${bytes.toString('base64')}`);
}
const menuOutput = new URL('./setup-menu/', output);
await mkdir(menuOutput, { recursive: true });
for (const [slug, payload] of Object.entries(setup)) {
  await writeFile(new URL('./' + slug + '.json', menuOutput), JSON.stringify(payload, null, 2) + '\n');
}
await writeFile(new URL('./preview.html', output), renderPreview(catalog, covers));
await writeFile(new URL('./catalog.json', output), JSON.stringify(catalog, null, 2) + '\n');
await writeFile(new URL('./asset-briefs.json', output), JSON.stringify(
  catalog.shops.flatMap(shop => [
    { type: 'cover', id: shop.slug, prompt: shop.imageBrief },
    ...shop.items.map(item => ({ type: 'menu-photo', id: item.sku, prompt: item.imageBrief })),
  ]), null, 2) + '\n');
await writeFile(new URL('./cover-briefs.json', output), JSON.stringify(
  catalog.shops.map(({ slug, name, category, zone, imageBrief }) => ({
    slug, name, category, zone, filename: slug + '.webp', prompt: imageBrief,
  })), null, 2) + '\n');
console.log(`Exported 12 setup bodies, 192 image briefs, a cover-only list and an offline preview with ${covers.size} covers to .local/market-pilot/.`);
