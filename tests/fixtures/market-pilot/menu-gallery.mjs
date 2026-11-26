import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { money, validateCatalog } from './catalog.mjs';

const fixture = name => readFile(new URL(name, import.meta.url), 'utf8');
const catalog = validateCatalog(await fixture('shops.json'), await fixture('menu.tsv'));
const { menuGroups, ...shop } = JSON.parse(await fixture('tam-sang-extension.json'));
assert.match(shop.slug, /^market-[a-z0-9-]+$/);
assert.match(shop.code, /^[A-Z]{2,5}$/);
assert.ok(catalog.shops.every(base => base.slug !== shop.slug && base.code !== shop.code));
assert.ok(catalog.shops.some(base => base.category === shop.category));
assert.ok(shop.opens < shop.closes && [shop.opens, shop.closes].every(time => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)));
assert.equal(new Set(menuGroups.map(group => group.name)).size, 4);

let sequence = 0;
shop.items = menuGroups.flatMap(group => group.items.map(item => {
  assert.ok(Number.isSafeInteger(item.baht) && item.baht > 0 && item.baht <= 200);
  assert.ok([group.name, item.name, item.description, item.unit ?? group.unit].every(value => value.trim()));
  const sku = `MKT-${shop.code}-${String(++sequence).padStart(2, '0')}`;
  const serving = group.unit === 'แก้ว'
    ? 'เครื่องดื่มหนึ่งแก้ว เห็นสีและชั้นของเครื่องดื่ม ถ่ายระดับเดียวกับปากแก้วเล็กน้อย'
    : 'อาหารไทยหนึ่งที่ตามคำอธิบายบนจานหรือชามธรรมดาของร้าน ถ่ายมุม 45 องศา';
  return { sku, category: group.name, name: item.name, description: item.description, priceMinor: item.baht * 100,
    unit: item.unit ?? group.unit, status: 'available',
    imageBrief: `ภาพถ่ายเมนู ${item.name}: ${item.description}; ${serving} บนโต๊ะสเตนเลสในร้านอาหารตลาด แสงธรรมชาติ` };
}));
assert.equal(shop.items.length, 15);
assert.equal(new Set(shop.items.map(item => item.name)).size, shop.items.length);
const shops = [...catalog.shops, shop];
const items = shops.flatMap(store => store.items);
assert.equal(items.length, 195);
assert.equal(new Set(items.map(item => item.sku)).size, items.length);

const publicDir = new URL('../../../apps/web/dist/market-sip-soi/', import.meta.url);
const localDir = new URL('../../../.local/market-pilot/menu-gallery/', import.meta.url);
const photoDir = new URL('menu-photos/', localDir);
const pending = [
  { type: 'cover', id: shop.slug, filename: `${shop.slug}.webp`, size: '1536x1024', prompt: shop.imageBrief },
  ...shops.flatMap(store => store.items.map(item => ({
    type: 'menu-photo', id: item.sku, filename: `${item.sku}.webp`, size: '1024x1024',
    prompt: `Use case: photorealistic-natural. ${item.imageBrief}. Thai menu item: ${item.name}. ` +
      `Required visible ingredients and serving: ${item.description}. One portion only. ` +
      'Keep all food or the whole glass in frame with room for a square crop. Natural Thai market food photography; ' +
      'no collage, no extra dishes, no labels, no readable text, no logos, no watermark.',
  }))),
];
assert.equal(new Set(pending.map(job => job.prompt)).size, 196);
assert.equal(new Set(pending.map(job => job.filename)).size, 196);

await mkdir(localDir, { recursive: true });
await mkdir(photoDir, { recursive: true });
await writeFile(new URL('image-jobs.json', localDir), JSON.stringify(pending, null, 2) + '\n');

const photos = new Map();
for (const job of pending) {
  const bytes = await readFile(new URL(job.filename, photoDir)).catch(error => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!bytes) continue;
  assert.ok(bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length,
  `Invalid WebP: ${job.filename}`);
  photos.set(job.id, { filename: job.filename, bytes });
}

const e = value => String(value).replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const figure = (src, alt, classes, width, height, priority = false) =>
  `<img class="${classes}" src="${e(src)}" width="${width}" height="${height}"${priority ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async" alt="${e(alt)}">`;

const categories = Map.groupBy(shops, store => store.category);
const menuPhotoCount = items.filter(item => photos.has(item.sku)).length;
const focusShop = shops.toSorted((a, b) => Number(b === shop) - Number(a === shop));
const html = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self'">
<title>ตลาดสี่ซอย · ร้านและเมนู</title>
<style>
:root{--canvas:#fffbf5;--surface:#fff;--text:#141b2d;--muted:#596579;--border:#e5e7ee;--yellow:#ffc52f;--pale:#fff1cc;--dark:#80500c}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--text);font:1rem/1.65 'Leelawadee UI',Tahoma,sans-serif}main{max-width:72rem;margin:auto;padding:clamp(1rem,4vw,3rem)}h1,h2,h3,p,ul{margin:0}h1{font-size:clamp(2rem,5vw,3.4rem);line-height:1.3}h2{line-height:1.4}h3{font-size:1rem}a{color:var(--dark);text-underline-offset:.19em}summary,a{overflow-wrap:anywhere}summary:focus-visible,a:focus-visible{outline:3px solid var(--dark);outline-offset:3px}small,.muted{color:var(--muted)}header{border-bottom:3px solid var(--yellow);padding-bottom:1rem}header p{margin-block:.35rem}main>section,article{margin-top:1.2rem}nav{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr));gap:.5rem;margin-top:.5rem}nav div{padding:.45rem .7rem;background:var(--pale);border-radius:.55rem}nav a,.toplink{display:flex;align-items:center;min-height:44px}article{scroll-margin-top:1rem;background:var(--surface);border:1px solid var(--border);border-radius:1rem;padding:clamp(.8rem,3vw,1.5rem)}.shop-cover{width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:.65rem;display:block;margin-bottom:.7rem}.meta{margin-block:.2rem .5rem;color:var(--dark)}.shop-copy{margin-block:.3rem}.pending{color:var(--muted);font-size:.9rem}.catalog-note{margin-bottom:.55rem}details{margin-top:.75rem}summary{cursor:pointer;border-radius:.6rem;background:var(--pale);padding:.65rem .85rem;min-height:44px;font-weight:700}.menu-group{margin-top:1rem}.menu-group ul{padding:0;list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,16rem),1fr));gap:.65rem;margin-top:.3rem}.menu-group li{padding:.7rem;border:1px solid var(--border);border-radius:.65rem;min-width:0;overflow-wrap:anywhere}.menu-photo{display:block;width:100%;height:auto;aspect-ratio:1;object-fit:cover;border-radius:.4rem;margin-bottom:.45rem}.dish-name{font-weight:700}.price{display:block;font-weight:700;margin-top:.2rem}.sold{color:#8a2622}
</style></head><body><main id="top">
<header><p><strong>ข้อมูลทดลอง · ร้านและภาพจำลอง</strong></p>
<h1>ตลาดสี่ซอย</h1><p>${shops.length} ร้าน · ${categories.size} หมวด · ${items.length} เมนู</p>
<p class="muted">รูปเมนู ${menuPhotoCount} จาก ${items.length} รูป · ดูรายละเอียดร้าน เมนู และราคา</p>
<a class="toplink" href="index.html">เปิดหน้าตลาดชุดเดิม</a></header>
<section aria-labelledby="categories"><h2 id="categories">เลือกร้านตามหมวด</h2>
<nav aria-label="หมวดร้าน">${[...categories].map(([name, stores]) =>
  `<div><strong>${e(name)}</strong>${stores.map(store => `<a href="#${e(store.slug)}">${e(store.name)}</a>`).join('')}</div>`).join('')}</nav>
</section>
${focusShop.map(store => {
  const cover = store === shop ? photos.get(store.slug) : { filename: `${store.slug}.webp` };
  const source = cover && (store === shop ? `menu-photos/${cover.filename}` : cover.filename);
  return `<article id="${e(store.slug)}" aria-labelledby="${e(store.slug)}-title">
${source ? figure(source, `ภาพจำลองหน้าร้าน ${store.name}`, 'shop-cover', 960, 540, store === shop) : '<p class="pending catalog-note">ภาพหน้าร้านกำลังเตรียม</p>'}
<h2 id="${e(store.slug)}-title">${e(store.name)}</h2>
<p class="meta">${e(store.category)} · ${e(store.zone)} · ${e(store.opens)}–${e(store.closes)} · หยุดวัน${e(store.closedDay)}</p>
<p class="shop-copy">${e(store.description)}</p><p class="shop-copy">${e(store.pickup)}</p>
<details${store === shop ? ' open' : ''}><summary>เมนู ${store.items.length} รายการ</summary>
${[...Map.groupBy(store.items, item => item.category)].map(([category, dishes]) =>
  `<section class="menu-group"><h3>${e(category)}</h3><ul>${dishes.map(item => {
    const photo = photos.get(item.sku);
    return `<li data-sku="${e(item.sku)}">${photo ? figure(`menu-photos/${photo.filename}`, item.name, 'menu-photo', 640, 640) : '<p class="pending">กำลังเตรียมรูปเมนู</p>'}
<p class="dish-name">${e(item.name)}</p><p class="muted">${e(item.description)}</p>
${(item.groups ?? []).map(group => `<small>${e(group.name)}: ${group.options.map(option => `${e(option.name)}${option.priceMinor ? ` +฿${money(option.priceMinor)}` : ''}`).join(' / ')}</small>`).join('')}
${item.status === 'sold-out' ? '<small class="sold">ขายหมดในชุดข้อมูล</small>' : ''}
<span class="price">฿${money(item.priceMinor)} <small>/ ${e(item.unit)}</small></span></li>`;
  }).join('')}</ul></section>`).join('')}</details></article>`;
}).join('\n')}
<a class="toplink" href="#top">กลับไปเลือกหมวด</a></main></body></html>\n`;

await writeFile(new URL('menu-gallery.html', localDir), html);
if (process.argv.includes('--publish-local-preview')) {
  await readFile(new URL('index.html', publicDir));
  for (const store of catalog.shops) await readFile(new URL(`${store.slug}.webp`, publicDir));
  const publicPhotos = new URL('menu-photos/', publicDir);
  if (photos.size) await mkdir(publicPhotos, { recursive: true });
  for (const { filename, bytes } of photos.values()) await writeFile(new URL(filename, publicPhotos), bytes);
  await writeFile(new URL('menu-gallery.html', publicDir), html);
}
console.log(`${shops.length} shops, ${categories.size} categories, ${items.length} dishes, ${pending.length} image jobs; ${menuPhotoCount} menu images and ${Number(photos.has(shop.slug))} new cover ready.`);
