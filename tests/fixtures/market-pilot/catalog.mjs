const HEADER = 'shop\tsku\tcategory\tname\tbaht\tunit\tstatus\tdescription\timage_brief';
const CLOCK = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const SLUG = /^market-[a-z0-9-]{1,42}$/;
const CODE = /^[A-Z]{2,5}$/;
const KEY = /^[a-z][a-z0-9-]{0,39}$/;
const MODIFIER_MAX_MINOR = 999999;
const visible = value => typeof value === 'string' && value.length > 0 &&
  value === value.trim() && !/[\p{Cc}\p{Cf}]/u.test(value);
const nonnegative = value => Number.isSafeInteger(value) && value >= 0;

export function money(minor) {
  return String(Math.floor(minor / 100)) + '.' + String(minor % 100).padStart(2, '0');
}

function requireValue(value, problem) {
  if (!value) throw new Error(problem);
}

export function validateCatalog(rawShops, rawMenu) {
  const catalog = JSON.parse(rawShops);
  requireValue(catalog.id === 'market-pilot-v1' && catalog.timezone === 'Asia/Bangkok', 'Unexpected dataset');
  requireValue(Array.isArray(catalog.shops) && catalog.shops.length === 12, 'Expected 12 shops');
  const seenSlugs = new Set();
  const seenCategories = new Set();
  const briefs = new Set();
  const imageBrief = (value, context) => {
    requireValue(visible(value) && !briefs.has(value), 'Invalid or duplicate image brief: ' + context);
    briefs.add(value);
  };
  const shopsByCode = new Map();
  for (const shop of catalog.shops) {
    requireValue(SLUG.test(shop.slug) && CODE.test(shop.code) && !seenSlugs.has(shop.slug) &&
      !shopsByCode.has(shop.code), 'Invalid or duplicate shop identifier');
    requireValue([shop.name, shop.category, shop.zone, shop.closedDay, shop.pickup, shop.description].every(visible) &&
      !seenCategories.has(shop.category), 'Invalid shop profile: ' + shop.code);
    requireValue(CLOCK.test(shop.opens) && CLOCK.test(shop.closes) && shop.opens < shop.closes, 'Invalid shop hours: ' + shop.code);
    imageBrief(shop.imageBrief, shop.code);
    shop.items = [];
    seenSlugs.add(shop.slug);
    seenCategories.add(shop.category);
    shopsByCode.set(shop.code, shop);
  }

  const [header, ...rows] = rawMenu.trimEnd().split(/\r?\n/);
  requireValue(header === HEADER, 'Unexpected menu columns');
  const items = new Map();
  for (const [line, row] of rows.entries()) {
    const fields = row.split('\t');
    const [code, sku, category, name, baht, unit, status, description, brief] = fields;
    requireValue(fields.length === 9 && fields.every(visible), 'Invalid menu row ' + (line + 2));
    const shop = shopsByCode.get(code);
    requireValue(shop && new RegExp('^MKT-' + code + '-\\d{2}$').test(sku), 'Invalid SKU: ' + sku);
    requireValue(!items.has(sku), 'Duplicate SKU: ' + sku);
    requireValue(/^[1-9]\d{0,3}$/.test(baht) && ['available', 'sold-out'].includes(status),
      'Invalid price or status: ' + sku);
    imageBrief(brief, sku);
    const item = { sku, category, name, priceMinor: Number(baht) * 100, unit, status,
      description, imageBrief: brief, groups: [] };
    shop.items.push(item);
    items.set(sku, { item, shop });
  }
  requireValue(items.size === 180 && catalog.shops.every(shop => shop.items.length >= 12 && shop.items.length <= 18),
    'Expected 180 menu rows and 12–18 per shop');

  requireValue(Array.isArray(catalog.modifiers), 'Missing modifier groups');
  for (const group of catalog.modifiers) {
    const item = items.get(group.sku)?.item;
    requireValue(item && KEY.test(group.id) && visible(group.name) && !item.groups.some(other => other.id === group.id),
      'Invalid modifier group: ' + group.sku);
    requireValue(Array.isArray(group.options) && nonnegative(group.min) && nonnegative(group.max) &&
      group.min <= group.max && group.max > 0 && group.max <= group.options.length, 'Invalid modifier bounds: ' + group.sku);
    const seen = new Set(item.groups.flatMap(other => other.options.map(option => option.id)));
    for (const option of group.options) {
      requireValue(KEY.test(option.id) && visible(option.name) && nonnegative(option.priceMinor) &&
        option.priceMinor <= MODIFIER_MAX_MINOR && !seen.has(option.id), 'Invalid modifier option: ' + group.sku);
      seen.add(option.id);
    }
    item.groups.push(group);
  }

  const scenarioIDs = new Set();
  const scenarioShops = new Set();
  requireValue(Array.isArray(catalog.scenarios) && catalog.scenarios.length === 4, 'Expected four scenarios');
  for (const scenario of catalog.scenarios) {
    requireValue(KEY.test(scenario.id) && !scenarioIDs.has(scenario.id) && seenSlugs.has(scenario.shop) &&
      !scenarioShops.has(scenario.shop), 'Invalid scenario: ' + scenario.id);
    requireValue(visible(scenario.title) && Array.isArray(scenario.roles) && scenario.roles.length > 0 &&
      scenario.roles.every(visible) && Array.isArray(scenario.steps) && scenario.steps.length > 0 &&
      scenario.steps.every(visible) && Array.isArray(scenario.lines) && scenario.lines.length > 0 &&
      [ '/pos', '/kitchen', '/shop/' + scenario.shop ].includes(scenario.route), 'Incomplete scenario: ' + scenario.id);
    scenarioIDs.add(scenario.id);
    scenarioShops.add(scenario.shop);
    let expected = 0;
    for (const line of scenario.lines) {
      const match = items.get(line.sku);
      requireValue(match?.shop.slug === scenario.shop, 'Scenario references foreign or missing SKU: ' + line.sku);
      requireValue(Number.isSafeInteger(line.qty) && line.qty > 0 && line.qty <= 100 &&
        match.item.status === 'available', 'Invalid scenario quantity or item status: ' + line.sku);
      const choices = line.options ?? [];
      requireValue(Array.isArray(choices) && new Set(choices).size === choices.length, 'Invalid scenario options: ' + line.sku);
      const optionPrices = new Map();
      for (const group of match.item.groups) {
        const selected = group.options.filter(option => choices.includes(option.id));
        requireValue(selected.length >= group.min && selected.length <= group.max, 'Scenario options outside allowed range: ' + line.sku);
        for (const option of selected) optionPrices.set(option.id, option.priceMinor);
      }
      requireValue(choices.length === optionPrices.size, 'Scenario references missing option: ' + line.sku);
      expected += line.qty * (match.item.priceMinor + [...optionPrices.values()].reduce((sum, price) => sum + price, 0));
    }
    requireValue(Number.isSafeInteger(expected) && expected === scenario.totalMinor, 'Scenario total mismatch: ' + scenario.id);
  }
  return catalog;
}

// The setup endpoint accepts names, categories, SKUs and prices only.
export function buildSetupBodies(catalog) {
  return Object.fromEntries(catalog.shops.map(shop => [
    shop.slug,
    {
      categories: [...new Set(shop.items.map(item => item.category))].map(name => ({ name })),
      items: shop.items.map(item => ({ category: item.category, name: item.name, sku: item.sku, price: money(item.priceMinor) })),
    },
  ]));
}

const escape = value => String(value).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function renderPreview(catalog) {
  const e = escape;
  const zones = [...new Set(catalog.shops.map(shop => shop.zone))];
  const nav = zones.map((zone, i) => '<a href="#zone-' + i + '">' + e(zone) + '</a>').join('');
  const shops = zones.map((zone, i) => '<section class="zone" id="zone-' + i + '"><h2>' + e(zone) +
    '</h2>' + catalog.shops.filter(shop => shop.zone === zone).map(shop => {
      const groups = [...new Set(shop.items.map(item => item.category))];
      const menu = groups.map(category => '<section class="menu-group"><h4>' + e(category) + '</h4><ul>' +
        shop.items.filter(item => item.category === category).map(item => {
          const choices = item.groups.map(group => '<small>' + e(group.name) + ': ' + group.options.map(option =>
            e(option.name) + (option.priceMinor ? ' +' + money(option.priceMinor) + ' ฿' : '')).join(' / ') + '</small>').join('');
          return '<li><div><strong>' + e(item.name) + '</strong> <span class="sku">' + e(item.sku) +
            '</span><p>' + e(item.description) + '</p>' + choices + (item.status === 'sold-out' ? '<small class="sold">ขายหมดในชุดข้อมูล</small>' : '') +
            '</div><b>฿' + money(item.priceMinor) + '<small> / ' + e(item.unit) + '</small></b></li>';
        }).join('') + '</ul></section>').join('');
      return '<article id="' + e(shop.slug) + '"><h3>' + e(shop.name) + '</h3><p>' + e(shop.category) +
        ' · ' + e(shop.opens) + '–' + e(shop.closes) + ' · หยุดวัน' + e(shop.closedDay) + '</p><p>' +
        e(shop.description) + ' ' + e(shop.pickup) + '</p><details><summary>ดู ' + shop.items.length + ' เมนู</summary>' +
        menu + '</details></article>';
    }).join('') + '</section>').join('');
  const cases = catalog.scenarios.map(scenario => '<article><h3>' + e(scenario.title) + '</h3><p><a href="#' +
    e(scenario.shop) + '">ดูร้าน</a> · ' + e(scenario.roles.join(' / ')) + ' · ยอดคาดหวัง ฿' + money(scenario.totalMinor) +
    '</p><ol>' + scenario.steps.map(step => '<li>' + e(step) + '</li>').join('') + '</ol></article>').join('');

  return [
    '<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta http-equiv="Content-Security-Policy" content="default-src \u0027none\u0027; style-src \u0027unsafe-inline\u0027">',
    '<title>ตลาดสี่ซอย — หน้าตรวจข้อมูล</title>',
    '<style>body{margin:0;background:#faf7f0;color:#262016;font:1rem/1.55 "Leelawadee UI",Tahoma,sans-serif}main{max-width:54rem;margin:auto;padding:clamp(.9rem,4vw,2.5rem)}header{border-bottom:3px solid #e9aa23;padding-bottom:1rem}h1{font-size:clamp(2rem,6vw,4rem);margin:.25em 0}h2{margin:1.5em 0 .5em}h3{margin:0}p{margin:.3em 0}a{color:#573500}nav{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.75rem}nav a,summary{padding:.65rem .85rem;background:#ffefc0;border-radius:.45rem}article{background:#fff;border:1px solid #e6dccd;border-radius:.55rem;padding:1rem;margin:.8rem 0;overflow-wrap:anywhere}details{margin-top:.85rem}summary{cursor:pointer}summary:focus-visible,a:focus-visible{outline:3px solid #6a4100;outline-offset:2px}.menu-group ul{padding:0;list-style:none}.menu-group li{display:flex;justify-content:space-between;gap:.65rem;padding:.75rem 0;border-bottom:1px solid #eee3d5}.menu-group li b{white-space:nowrap}small{display:block;color:#5b5146}.sku{font:inherit;color:#665748;font-size:.8rem}.sold{color:#8a2622}@media(max-width:30rem){.menu-group li{display:block}.menu-group li b{display:block;margin-top:.2rem}.menu-group li b small{display:inline}}</style>',
    '<main><header><p>หน้าตรวจข้อมูลแบบออฟไลน์ · ร้านสมมติ</p><h1>ตลาดสี่ซอย</h1><p>' +
      catalog.shops.length + ' ร้าน · ' + catalog.shops.flatMap(s => s.items).length +
      ' เมนู · ' + catalog.scenarios.length + ' ฉากทดสอบ</p><p>หน้านี้ใช้ตรวจชื่อ ราคา และรายละเอียดเมนู ยังไม่มีรูป ซีเควนซ์ชำระเงิน หรือข้อมูลจากฐาน SmartPOS</p>' +
      '<nav aria-label="ย่านตลาด">' + nav + '<a href="#scenarios">ฉากทดสอบ</a></nav></header>',
    shops, '<section id="scenarios"><h2>ฉากทดสอบที่เตรียมไว้</h2>' + cases + '</section></main></html>\n',
  ].join('\n');
}
