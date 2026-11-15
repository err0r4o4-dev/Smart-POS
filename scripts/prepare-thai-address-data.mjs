import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const targets = [
  'apps/web/public/data/thai-addresses.json',
  'apps/api/internal/platform/thaiaddress/data.json',
];
if (process.argv[2] === '--check') {
  const copies = targets.map((path) => readFileSync(path));
  if (!copies[0].equals(copies[1])) throw new Error('Thai address data copies differ');
  const source = JSON.parse(readFileSync('apps/web/public/data/thai-addresses.source.json', 'utf8'));
  if (createHash('sha256').update(copies[0]).digest('hex') !== source.sha256) throw new Error('Thai address data checksum mismatch');
  const data = JSON.parse(copies[0]);
  const provinces = new Set(data.provinces.map((entry) => entry[0]));
  const districts = new Set(data.districts.map((entry) => entry[0]));
  if (provinces.size !== 77 || districts.size !== data.districts.length || data.districts.some((entry) => !provinces.has(entry[1])) || data.subdistricts.some((entry) => !districts.has(entry[1]) || !/^\d{5}$/.test(entry[4]))) throw new Error('Invalid Thai address hierarchy');
  console.log(`Thai address data PASS: ${provinces.size} provinces, ${districts.size} districts, ${data.subdistricts.length} subdistricts`);
} else {
  const source = process.argv[2];
  if (!source) throw new Error('Pass the directory of the pinned province.json, district.json, sub_district.json and LICENSE; no network is used');
  const read = (name) => JSON.parse(readFileSync(resolve(source, `${name}.json`), 'utf8')).filter((entry) => entry.deleted_at === null);
  const data = {
    provinces: read('province').map((entry) => [entry.id, entry.name.th, entry.name.en]),
    districts: read('district').map((entry) => [entry.id, entry.province_id, entry.name.th, entry.name.en]),
    subdistricts: read('sub_district').map((entry) => [entry.id, entry.district_id, entry.name.th, entry.name.en, String(entry.zip_code)]),
  };
  const bytes = JSON.stringify(data) + '\n';
  for (const path of targets) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    writeFileSync(resolve(dirname(path), 'thai-addresses.LICENSE'), readFileSync(resolve(source, 'LICENSE')));
  }
  writeFileSync('apps/web/public/data/thai-addresses.source.json', JSON.stringify({
    repository: 'https://github.com/kongvut/thai-province-data',
    commit: '07319ed40eb3440c9a1b17cc48fa223340ddce55',
    license: 'MIT',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    fields: { provinces: ['id', 'name_th', 'name_en'], districts: ['id', 'province_id', 'name_th', 'name_en'], subdistricts: ['id', 'district_id', 'name_th', 'name_en', 'postal_code'] },
  }, null, 2) + '\n');
}
