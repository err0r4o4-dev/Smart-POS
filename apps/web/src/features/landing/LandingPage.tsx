import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowRight,
  Boxes,
  Check,
  Layers3,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  UsersRound,
} from 'lucide-react';
import { useAuth } from '../../app/AuthProvider';
import { paths } from '../../app/routes';
import { Brand } from '../../components/ui/primitives';
import { POSPreview } from './POSPreview';
import './landing.css';

const steps = [
  {
    number: '01',
    icon: Store,
    title: 'ตั้งค่าร้านและสาขา',
    description: 'เพิ่มข้อมูลร้าน สาขา และพนักงานให้พร้อมสำหรับการทำงานร่วมกัน',
  },
  {
    number: '02',
    icon: Boxes,
    title: 'เพิ่มสินค้าและจัดการสต็อก',
    description:
      'จัดหมวดหมู่สินค้า กำหนดราคาและบาร์โค้ด พร้อมดูแลสินค้าคงคลังในที่เดียว',
  },
  {
    number: '03',
    icon: ReceiptText,
    title: 'เริ่มขายและติดตามรายการขาย',
    description:
      'ขายผ่านหน้าจอ POS ออกใบเสร็จ และย้อนดูรายการขายได้อย่างเป็นระบบ',
  },
];
const features = [
  {
    icon: Layers3,
    title: 'สินค้าและสต็อก เชื่อมถึงกัน',
    description:
      'จัดการข้อมูลสินค้าและความเคลื่อนไหวของสต็อกในระบบเดียว ลดการสลับเครื่องมือระหว่างทำงาน',
  },
  {
    icon: Store,
    title: 'ดูแลร้านและสาขาได้เป็นระบบ',
    description:
      'แยกบริบทการทำงานของแต่ละสาขา พร้อมจัดการข้อมูลร้านและทีมงานจากพื้นที่ทำงานของคุณ',
  },
  {
    icon: ShieldCheck,
    title: 'กำหนดสิทธิ์ให้เหมาะกับทีม',
    description:
      'จัดการบทบาทและสิทธิ์ของพนักงาน ให้แต่ละคนเข้าถึงเครื่องมือที่เหมาะกับหน้าที่ของตนเอง',
  },
];

export function LandingPage() {
  const { state } = useAuth();
  const authenticated = state.status === 'authenticated';
  const loading = state.status === 'loading';
  return (
    <div className="landing-page">
      <a className="skip-link" href="#landing-main">
        ข้ามไปเนื้อหาหลัก
      </a>
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link to="/" aria-label="VELO POS หน้าแรก">
            <Brand />
          </Link>
          <nav className="landing-navigation" aria-label="เมนูหน้าแรก">
            <Link className="landing-shop-link" to={paths.shop}>
              หน้าร้านออนไลน์
            </Link>
            <a className="landing-nav-guide" href="#how-it-works">
              วิธีใช้งาน
            </a>
            {loading ? (
              <button className="button" type="button" disabled>
                กำลังตรวจสอบ…
              </button>
            ) : (
              <Link
                className="button"
                to={authenticated ? paths.workspace : paths.login}
              >
                {authenticated ? 'เข้าสู่พื้นที่ทำงาน' : 'เข้าสู่ระบบ'}
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main id="landing-main" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-container landing-hero-inner">
            <div className="landing-hero-copy">
              <span className="landing-eyebrow landing-hero-badge">
                <Sparkles size={15} aria-hidden="true" /> SMART TOOLS. SIMPLER
                RETAIL.
              </span>
              <h1 id="landing-title">
                จัดการร้านให้ง่าย
                <br />
                ขายได้<span className="landing-title-accent">อย่างมั่นใจ</span>
              </h1>
              <p className="landing-hero-description">
                ให้ทุกวันของร้าน เป็นเรื่องง่ายขึ้นด้วย SmartPOS
                <br className="landing-desktop-break" /> เชื่อมต่อการขาย สินค้า
                และสต็อกไว้ในพื้นที่เดียว
                <br className="landing-desktop-break" />{' '}
                เพื่อให้คุณมีเวลาดูแลสิ่งที่สำคัญกว่า
              </p>
              <div className="landing-hero-actions">
                {loading ? (
                  <button className="button" type="button" disabled>
                    กำลังตรวจสอบ…
                  </button>
                ) : (
                  <Link
                    className="button"
                    to={authenticated ? paths.workspace : paths.register}
                  >
                    {authenticated ? 'เข้าสู่พื้นที่ทำงาน' : 'เริ่มต้นใช้งาน'}
                    <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                )}
                <a className="button button-secondary" href="#how-it-works">
                  ดูวิธีใช้งาน
                  <ArrowDown size={16} aria-hidden="true" />
                </a>
              </div>
              <ul
                className="landing-hero-benefits"
                aria-label="จุดเด่นของ SmartPOS"
              >
                {[
                  'ใช้งานเป็นระบบ',
                  'เชื่อมต่อทุกงานร้าน',
                  'เติบโตไปพร้อมคุณ',
                ].map((benefit) => (
                  <li key={benefit}>
                    <Check size={14} aria-hidden="true" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
            <POSPreview />
          </div>
        </section>
        <section
          className="landing-access"
          aria-labelledby="landing-access-title"
        >
          <div className="landing-container">
            <div className="landing-section-heading">
              <p className="landing-eyebrow">คนละหน้าที่ คนละพื้นที่</p>
              <h2 id="landing-access-title">เลือกทางเข้าที่ตรงกับคุณ</h2>
              <p>
                หน้าร้านสำหรับลูกค้าแยกจากทีมร้าน
                สิทธิ์ของเจ้าของร้านและพนักงานตรวจสอบจากบัญชีจริง
              </p>
            </div>
            <div className="landing-access-grid">
              <article>
                <ShoppingBag size={28} aria-hidden="true" />
                <h3>ลูกค้า</h3>
                <p>
                  หน้าร้านออนไลน์สำหรับเลือกซื้อสินค้า ไม่ต้องเปิดกะหรือใช้
                  terminal
                </p>
                <span className="tag tag-amber">ยังไม่เปิดรับออเดอร์</span>
                <Link className="button" to={paths.shop}>
                  ไปหน้าร้านลูกค้า
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </article>
              <article>
                <ShieldCheck size={28} aria-hidden="true" />
                <h3>เจ้าของร้าน / ผู้จัดการ</h3>
                <p>
                  จัดการข้อมูลร้าน สินค้า สต็อก และทีมงาน ตามสิทธิ์ที่ได้รับ
                </p>
                <Link
                  className="button button-secondary"
                  to={authenticated ? paths.workspace : paths.login}
                >
                  เข้าสู่การจัดการร้าน
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </article>
              <article>
                <UsersRound size={28} aria-hidden="true" />
                <h3>พนักงาน</h3>
                <p>เข้าทำงานขาย คลังสินค้า หรือจัดซื้อ เฉพาะหน้าที่ของคุณ</p>
                <Link
                  className="button button-secondary"
                  to={authenticated ? paths.workspace : paths.login}
                >
                  เข้าสู่พื้นที่พนักงาน
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
              </article>
            </div>
          </div>
        </section>
        <section
          id="how-it-works"
          className="landing-how"
          aria-labelledby="landing-how-title"
        >
          <div className="landing-container">
            <div className="landing-section-heading">
              <p className="landing-eyebrow">เริ่มต้นได้ ไม่ซับซ้อน</p>
              <h2 id="landing-how-title">พร้อมดูแลร้าน ใน 3 ขั้นตอน</h2>
              <p>
                จากการตั้งค่าครั้งแรก ถึงการขายหน้าร้าน
                เริ่มจัดการทุกอย่างให้เป็นระบบไปด้วยกัน
              </p>
            </div>
            <ol className="landing-steps">
              {steps.map(({ number, icon: Icon, title, description }) => (
                <li className="landing-step" key={number}>
                  <div className="landing-step-top">
                    <span className="landing-step-number">{number}</span>
                    <Icon size={25} strokeWidth={1.6} aria-hidden="true" />
                  </div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </li>
              ))}
            </ol>
            <div className="landing-note">
              <Sparkles size={19} aria-hidden="true" />
              <p>
                <strong>
                  เริ่มจากสิ่งที่ร้านต้องการ แล้วค่อยเติบโตไปด้วยกัน
                </strong>{' '}
                เครื่องมือสำหรับการขาย สต็อก และทีมงาน อยู่ในพื้นที่ทำงานเดียว
              </p>
            </div>
          </div>
        </section>
        <section
          className="landing-features"
          aria-labelledby="landing-features-title"
        >
          <div className="landing-container">
            <div className="landing-feature-panel">
              <p className="landing-eyebrow">ออกแบบมาเพื่อการทำงานของร้าน</p>
              <h2 id="landing-features-title">
                ทุกส่วนของร้าน เชื่อมถึงกัน
                <br />
                ในพื้นที่เดียว
              </h2>
              <p className="landing-feature-intro">
                ลดความยุ่งยากของงานหลังร้าน
                ให้คุณและทีมทำงานร่วมกันได้อย่างเป็นระบบ
              </p>
              <div className="landing-feature-grid">
                {features.map(({ icon: Icon, title, description }) => (
                  <article key={title}>
                    <span className="landing-feature-icon">
                      <Icon size={23} strokeWidth={1.7} aria-hidden="true" />
                    </span>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <div className="landing-footer-brand">
            <Link to="/" aria-label="VELO POS หน้าแรก">
              <Brand />
            </Link>
          </div>
          <div className="landing-footer-links">
            <nav aria-label="ลิงก์ท้ายหน้า">
              <Link to={paths.help}>คู่มือการใช้งาน</Link>
              <a href="#how-it-works">วิธีเริ่มต้น</a>
            </nav>
            <small>© {new Date().getFullYear()} VELO POS · SmartPOS</small>
          </div>
        </div>
      </footer>
    </div>
  );
}
