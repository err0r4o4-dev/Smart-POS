import { Link } from 'react-router-dom';
import { ArrowLeft, Search, ShoppingCart } from 'lucide-react';
import { Brand, Button, Card, Tag } from '../components/ui/primitives';

export function POSLayout() {
  return (
    <div className="pos-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="preview-header">
        <Link to="/dashboard" className="back-link">
          <ArrowLeft size={20} />
          Overview
        </Link>
        <Brand />
        <Tag tone="amber">Layout preview</Tag>
      </header>
      <main id="main-content" className="preview-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">POINT OF SALE</p>
            <h1 tabIndex={-1}>Your next checkout experience</h1>
            <p>
              A responsive terminal layout. No products, cart or payment
              functionality yet.
            </p>
          </div>
        </div>
        <div className="notice" role="status">
          Phase 0 presentation only. Checkout and stock deduction arrive in
          Phase 3.
        </div>
        <div className="pos-grid">
          <Card className="product-panel">
            <h2>Product selection</h2>
            <label className="search-field">
              <Search size={20} aria-hidden="true" />
              <span className="sr-only">
                Search products (unavailable in preview)
              </span>
              <input disabled placeholder="Search products or scan a barcode" />
            </label>
            <div className="empty-state">
              <StoreIllustration />
              <h3>Your catalog starts here</h3>
              <p>
                Products will appear after catalog setup. An unknown barcode
                will require explicit product registration.
              </p>
              <Tag>Catalog · Phase 1</Tag>
            </div>
          </Card>
          <Card className="cart-panel">
            <h2>
              <ShoppingCart size={21} aria-hidden="true" />
              Shopping cart
            </h2>
            <div className="empty-state">
              <p>No cart is created in this preview.</p>
            </div>
            <div className="checkout-summary">
              <span>Checkout summary</span>
              <strong>Not available</strong>
              <Button disabled>Checkout unavailable</Button>
              <small>No sale or payment will be submitted.</small>
            </div>
          </Card>
        </div>
      </main>
    </div>
  );
}
function StoreIllustration() {
  return (
    <div className="empty-illustration" aria-hidden="true">
      <ShoppingCart size={46} strokeWidth={1.3} />
    </div>
  );
}
