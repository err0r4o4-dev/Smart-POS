import {
  ArrowRight,
  Barcode,
  Check,
  CheckCheck,
  ChevronRight,
  Coffee,
  Package,
  ReceiptText,
  ShoppingBag,
  ShoppingBasket,
} from 'lucide-react';

const products = [
  { icon: Coffee, name: 'เครื่องดื่ม', tone: 'yellow' },
  { icon: ShoppingBag, name: 'ของใช้ประจำวัน', tone: 'blue' },
  { icon: Package, name: 'สินค้าทั่วไป', tone: 'pink' },
];

export function POSPreview() {
  return (
    <figure
      className="landing-preview"
      aria-labelledby="landing-preview-caption"
    >
      <div className="landing-preview-glow" aria-hidden="true" />
      <div
        className="landing-preview-float landing-preview-float-top"
        aria-hidden="true"
      >
        <Barcode size={25} strokeWidth={1.7} />
      </div>
      <div className="landing-pos-window" aria-hidden="true">
        <div className="landing-pos-topbar">
          <span className="landing-pos-brand">
            <ShoppingBasket size={19} /> VELO POS
          </span>
          <span className="landing-pos-demo">DEMO</span>
        </div>
        <div className="landing-pos-content">
          <div className="landing-pos-products">
            <div className="landing-pos-heading">
              <span>สินค้าของร้าน</span>
              <span>
                ดูทั้งหมด <ChevronRight size={12} />
              </span>
            </div>
            <div className="landing-pos-search">
              <Barcode size={14} /> ค้นหาสินค้าหรือสแกนบาร์โค้ด
            </div>
            <div className="landing-pos-product-grid">
              {products.map(({ icon: Icon, name, tone }) => (
                <div className="landing-pos-product" key={name}>
                  <div
                    className={`landing-product-art landing-product-${tone}`}
                  >
                    <Icon size={36} strokeWidth={1.5} />
                  </div>
                  <span>{name}</span>
                  <small>พร้อมขาย</small>
                </div>
              ))}
            </div>
            <div className="landing-pos-stock">
              <span>
                <span className="landing-status-dot" /> เชื่อมต่อการจัดการสต็อก
              </span>
              <CheckCheck size={15} />
            </div>
          </div>
          <div className="landing-pos-cart">
            <span className="landing-pos-cart-title">
              <ReceiptText size={16} /> รายการขาย
            </span>
            {products.slice(0, 2).map(({ icon: Icon, name }) => (
              <div className="landing-pos-cart-row" key={name}>
                <span className="landing-cart-item">
                  <Icon size={18} />
                </span>
                <div>
                  <span>{name}</span>
                  <span className="landing-skeleton" />
                </div>
                <span>×1</span>
              </div>
            ))}
            <div className="landing-cart-total">
              <span className="landing-skeleton" />
              <span className="landing-skeleton" />
            </div>
            <span className="landing-pos-checkout">
              พร้อมสำหรับการขาย <ArrowRight size={14} />
            </span>
          </div>
        </div>
      </div>
      <div
        className="landing-preview-float landing-preview-float-bottom"
        aria-hidden="true"
      >
        <span className="landing-preview-check">
          <Check size={18} />
        </span>
        <div>
          <strong>ทุกส่วน ทำงานร่วมกัน</strong>
          <span>สินค้า · สต็อก · การขาย</span>
        </div>
      </div>
      <figcaption id="landing-preview-caption">
        ภาพตัวอย่างประกอบระบบ POS ไม่ใช่ข้อมูลการขายจริง
      </figcaption>
    </figure>
  );
}
