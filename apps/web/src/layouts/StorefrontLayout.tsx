import { Link, Outlet, useParams } from 'react-router-dom';
import { ShoppingBag, ShoppingCart } from 'lucide-react';
import { Brand, Tag } from '../components/ui/primitives';
import { paths } from '../app/routes';
import { useShopCart } from '../features/storefront/shop-cart';

export function StorefrontLayout() {
  const { slug } = useParams();
  const home = slug ? `/shop/${slug}` : paths.shop;
  const cart = useShopCart(slug);
  return (
    <div className="storefront-shell" data-workspace="customer">
      <a className="skip-link" href="#main-content">
        ข้ามไปเนื้อหา
      </a>
      <header className="storefront-header">
        <Link to={paths.shop} aria-label="หน้าร้านออนไลน์">
          <Brand />
        </Link>
        <Tag tone="amber">
          <ShoppingBag size={15} aria-hidden="true" /> สำหรับลูกค้า
        </Tag>
        <nav aria-label="เมนูหน้าร้านลูกค้า">
          {slug && (
            <Link
              className="storefront-icon-link storefront-cart-link"
              to={`${home}/cart`}
              aria-label={`ตะกร้า (${cart.items.length})`}
            >
              <ShoppingCart size={21} aria-hidden="true" />
              <span className="storefront-cart-count" aria-hidden="true">
                {cart.items.length}
              </span>
            </Link>
          )}
        </nav>
      </header>
      <main id="main-content" className="storefront-content">
        <Outlet />
      </main>
      <footer className="storefront-footer">
        <Brand compact />
        <span>หน้าร้านสำหรับลูกค้า · ไม่ใช่หน้าขาย POS ของพนักงาน</span>
        <Link to="/">หน้าหลัก SmartPOS</Link>
        <Link to={paths.login}>เข้าสู่ระบบทีมร้าน</Link>
      </footer>
    </div>
  );
}
