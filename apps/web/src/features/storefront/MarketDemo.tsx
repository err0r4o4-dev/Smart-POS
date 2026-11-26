import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useLanguage } from '../../app/language';
import './market-demo.css';

type Dish = {
  sku: string;
  name: string;
  category: string;
  description: string;
  price: string;
  unit: string;
  image: string;
};
type Shop = {
  name: string;
  category: string;
  cover: string;
  items: Dish[];
};

const fixture = './market-demo-fixture/catalog.json';
const shops =
  import.meta.glob<Shop[]>('./market-demo-fixture/catalog.json', {
    eager: true,
    import: 'default',
  })[fixture] ?? [];
const images = import.meta.glob<string>('./market-demo-fixture/*.webp', {
  eager: true,
  import: 'default',
  query: '?url',
});
const categories = [...new Set(shops.map((shop) => shop.category))];
const menuCount = shops.reduce((count, shop) => count + shop.items.length, 0);

function groupDishes(dishes: Dish[]) {
  const groups = new Map<string, Dish[]>();
  for (const dish of dishes) {
    const group = groups.get(dish.category) ?? [];
    group.push(dish);
    groups.set(dish.category, group);
  }
  return [...groups];
}

function imageUrl(name: string) {
  return images[`./market-demo-fixture/${name}`];
}

export default function MarketDemo() {
  const { language } = useLanguage();
  const [category, setCategory] = useState('');
  if (shops.length === 0) return null;

  const thai = language === 'th';
  const price = new Intl.NumberFormat(language, { maximumFractionDigits: 2 });
  return (
    <section className="market-demo" aria-labelledby="market-demo-title">
      <header className="market-demo-header">
        <div>
          <span className="market-demo-badge">
            {thai ? 'สาธิตเท่านั้น · ไม่รับออเดอร์' : 'Demo only · No orders'}
          </span>
          <h2 id="market-demo-title">
            {thai ? 'ร้านจำลองตลาดสี่ซอย' : 'Si Soi Market demo'}
          </h2>
          <p>
            {thai
              ? `${shops.length} ร้าน · ${categories.length} หมวดร้าน · ${menuCount} เมนู`
              : `${shops.length} shops · ${categories.length} categories · ${menuCount} dishes`}
          </p>
        </div>
        <label>
          {thai ? 'เลือกหมวดร้านจำลอง' : 'Demo shop category'}
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="">{thai ? 'ทุกหมวด' : 'All categories'}</option>
            {categories.map((name) => (
              <option key={name} value={name} lang="th">
                {name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="market-demo-grid">
        {shops
          .filter((shop) => !category || shop.category === category)
          .map((shop) => (
            <details key={shop.cover} className="market-demo-shop">
              <summary>
                <img
                  alt=""
                  src={imageUrl(shop.cover)}
                  width="640"
                  height="360"
                  loading="lazy"
                />
                <span className="market-demo-shop-copy">
                  <small lang="th">{shop.category}</small>
                  <strong lang="th">{shop.name}</strong>
                  <span className="market-demo-action">
                    {thai ? 'ดูเมนู' : 'Menu'}{' '}
                    <ChevronDown size={16} aria-hidden="true" />
                  </span>
                </span>
              </summary>
              <div className="market-demo-menu" lang="th">
                {groupDishes(shop.items).map(([name, dishes]) => (
                  <div key={name}>
                    <h3>{name}</h3>
                    <ul>
                      {dishes.map((dish) => (
                        <li key={dish.sku}>
                          <img
                            alt=""
                            src={imageUrl(dish.image)}
                            width="80"
                            height="80"
                            loading="lazy"
                          />
                          <div>
                            <strong>{dish.name}</strong>
                            <p>{dish.description}</p>
                            <b>{price.format(Number(dish.price))} บาท</b>{' '}
                            <small>/ {dish.unit}</small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </details>
          ))}
      </div>
    </section>
  );
}
