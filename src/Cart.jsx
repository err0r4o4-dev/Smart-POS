import { useMemo, useState } from 'react'
import {
  ArrowLeft, Search, Bell, ShoppingBag, Plus, Minus, Trash2,
  Utensils, ShoppingBasket, ChevronDown, CreditCard, Banknote,
  Tag, ShieldCheck, Clock3, CheckCircle2, X, Pencil, RotateCcw,
  QrCode, AlertCircle
} from 'lucide-react'
import './Cart.css'

const initialItems = [
  { id: 1, name: 'ข้าวกะเพราหมูสับ', detail: 'ไข่ดาว • เผ็ดปกติ', price: 69, image: 'https://images.unsplash.com/photo-1604908176997-125f25cc6f3d?w=500&auto=format&fit=crop&q=85', tag: 'ขายดี', note: '' },
  { id: 2, name: 'ข้าวผัดกุ้ง', detail: 'กุ้งสด • แตงกวา', price: 89, image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500&auto=format&fit=crop&q=85', tag: '', note: '' },
  { id: 3, name: 'ชาไทยเย็น', detail: 'หวาน 50% • แก้วใหญ่', price: 45, image: 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=500&auto=format&fit=crop&q=85', tag: '', note: '' }
]

const money = value =>
  `฿${Number(value || 0).toLocaleString('th-TH')}`

const tableOptions = Array.from(
  { length: 12 },
  (_, i) => `โต๊ะ ${String(i + 1).padStart(2, '0')}`
)

export default function Cart() {
  const [items, setItems] = useState(
    initialItems.map(item => ({ ...item, qty: 1 }))
  )
  const [orderType, setOrderType] = useState('dine')
  const [table, setTable] = useState('โต๊ะ 08')
  const [occupiedTables] = useState(['โต๊ะ 03', 'โต๊ะ 07'])
  const [payment, setPayment] = useState('promptpay')
  const [coupon, setCoupon] = useState('')
  const [couponApplied, setCouponApplied] = useState(false)
  const [couponMessage, setCouponMessage] = useState('')
  const [cashReceived, setCashReceived] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [search, setSearch] = useState('')
  const [editingItem, setEditingItem] = useState(null)
  const [editDetail, setEditDetail] = useState('')
  const [editNote, setEditNote] = useState('')
  const [removedItem, setRemovedItem] = useState(null)
  const [showUndo, setShowUndo] = useState(false)

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.qty, 0),
    [items]
  )

  const discount = couponApplied ? Math.round(subtotal * 0.1) : 0
  const total = Math.max(0, subtotal - discount)
  const count = items.reduce((sum, item) => sum + item.qty, 0)
  const change = Math.max(0, Number(cashReceived || 0) - total)

  const cashIsEnough =
    payment !== 'cash' ||
    (cashReceived !== '' && Number(cashReceived) >= total)

  const updateQty = (id, delta) => {
    setItems(current =>
      current
        .map(item =>
          item.id === id
            ? { ...item, qty: item.qty + delta }
            : item
        )
        .filter(item => item.qty > 0)
    )
  }

  const removeItem = id => {
    const target = items.find(item => item.id === id)
    if (!target) return

    setRemovedItem(target)
    setItems(current => current.filter(item => item.id !== id))
    setShowUndo(true)
  }

  const undoRemove = () => {
    if (removedItem) {
      setItems(current => [...current, removedItem])
    }

    setRemovedItem(null)
    setShowUndo(false)
  }

  const openEditor = item => {
    setEditingItem(item)
    setEditDetail(item.detail)
    setEditNote(item.note || '')
  }

  const saveEditor = () => {
    setItems(current =>
      current.map(item =>
        item.id === editingItem.id
          ? {
              ...item,
              detail: editDetail.trim() || item.detail,
              note: editNote.trim()
            }
          : item
      )
    )

    setEditingItem(null)
  }

  const applyCoupon = () => {
    if (coupon.trim().toUpperCase() === 'VELO10') {
      setCouponApplied(true)
      setCouponMessage('ใช้โค้ด VELO10 สำเร็จ ลด 10%')
    } else {
      setCouponApplied(false)
      setCouponMessage(
        coupon.trim()
          ? 'ไม่พบโค้ดส่วนลดนี้ กรุณาตรวจสอบอีกครั้ง'
          : 'กรุณากรอกโค้ดส่วนลด'
      )
    }
  }

  const confirmOrder = () => {
    if (!items.length || !cashIsEnough) return

    if (payment === 'promptpay') {
      setShowQR(true)
    } else {
      setShowSuccess(true)
    }
  }

  const finishOrder = () => {
    setShowQR(false)
    setShowSuccess(true)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">V</div>
          <span>
            VELO<span className="brand-light">POS</span>
          </span>
        </div>

        <div className="side-label">เมนูหลัก</div>

        <nav className="side-nav">
          <a href="#menu">
            <span className="nav-icon">▦</span> เมนูอาหาร
          </a>

          <a className="active" href="#cart">
            <ShoppingBag size={18} />
            ตะกร้าสินค้า
            <span className="nav-count">{count}</span>
          </a>

          <a href="#orders">
            <span className="nav-icon">▤</span>
            รายการสั่งซื้อ
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-icon">✦</div>
            <b>ต้องการความช่วยเหลือ?</b>
            <p>ทีมงานพร้อมดูแลคุณ</p>
            <button onClick={() => alert('ติดต่อพนักงานได้ที่เคาน์เตอร์')}>
              ติดต่อพนักงาน
            </button>
          </div>

          <div className="profile">
            <div className="avatar">M</div>
            <div>
              <b>Manager</b>
              <small>ผู้ดูแลร้านค้า</small>
            </div>
            <ChevronDown size={16} />
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>หน้าร้าน</span>
            <span className="crumb-sep">/</span>
            <b>ตะกร้าสินค้า</b>
          </div>

          <div className="top-actions">
            <div className="search-box">
              <Search size={17} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="ค้นหาเมนูอาหาร..."
              />
            </div>

            <button className="icon-button" aria-label="notifications">
              <Bell size={19} />
              <i />
            </button>

            <div className="top-avatar">M</div>
          </div>
        </header>

        <div className="page-heading">
          <div>
            <div className="eyebrow">ORDER MANAGEMENT</div>
            <h1>
              ตะกร้าสินค้า
              <span className="heading-count">{count} ชิ้น</span>
            </h1>
            <p>ตรวจสอบรายการอาหารและรายละเอียดก่อนยืนยันคำสั่งซื้อ</p>
          </div>

          <button
            className="back-button"
            onClick={() => {
              window.location.hash = 'menu'
            }}
          >
            <ArrowLeft size={17} />
            กลับไปเลือกเมนู
          </button>
        </div>

        <div className="content-grid">
          <section className="left-column">
            <div className="panel order-panel">
              <div className="panel-title">
                <div>
                  <h2>รายการอาหาร</h2>
                  <p>รายการที่คุณเลือกไว้ในตะกร้า</p>
                </div>

                <span className="item-counter">
                  {items.length} เมนู / {count} ชิ้น
                </span>
              </div>

              {items.length === 0 ? (
                <div className="empty-cart">
                  <ShoppingBag size={35} />
                  <b>ยังไม่มีสินค้าในตะกร้า</b>
                  <span>เลือกเมนูที่ชื่นชอบเพื่อเริ่มสั่งอาหาร</span>
                </div>
              ) : (
                <div className="cart-list">
                  {items
                    .filter(item =>
                      `${item.name} ${item.detail} ${item.note}`
                        .toLowerCase()
                        .includes(search.toLowerCase())
                    )
                    .map(item => (
                      <article className="cart-item" key={item.id}>
                        <div className="food-image">
                          <img src={item.image} alt={item.name} />
                          {item.tag && (
                            <span className="food-tag">{item.tag}</span>
                          )}
                        </div>

                        <div className="food-info">
                          <h3>{item.name}</h3>
                          <p>{item.detail}</p>

                          {item.note && (
                            <p className="item-note">
                              หมายเหตุ: {item.note}
                            </p>
                          )}

                          <span className="unit-price">
                            {money(item.price)}
                            <small> / รายการ</small>
                          </span>

                          <button
                            className="edit-item-button"
                            onClick={() => openEditor(item)}
                          >
                            <Pencil size={12} />
                            แก้ไขรายละเอียด
                          </button>
                        </div>

                        <div className="quantity-control">
                          <button
                            onClick={() => updateQty(item.id, -1)}
                            aria-label="ลดจำนวน"
                          >
                            <Minus size={14} />
                          </button>

                          <b>{item.qty}</b>

                          <button
                            onClick={() => updateQty(item.id, 1)}
                            aria-label="เพิ่มจำนวน"
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        <div className="line-total">
                          {money(item.price * item.qty)}
                        </div>

                        <button
                          className="remove-button"
                          onClick={() => removeItem(item.id)}
                          aria-label="ลบสินค้า"
                        >
                          <Trash2 size={17} />
                        </button>
                      </article>
                    ))}

                  {items.filter(item =>
                    `${item.name} ${item.detail} ${item.note}`
                      .toLowerCase()
                      .includes(search.toLowerCase())
                  ).length === 0 && (
                    <div className="no-search-result">
                      ไม่พบรายการที่ค้นหา
                    </div>
                  )}
                </div>
              )}

              <button
                className="add-more"
                onClick={() => {
                  window.location.hash = 'menu'
                }}
              >
                <Plus size={17} />
                เพิ่มรายการอาหาร
              </button>
            </div>

            <div className="panel service-panel">
              <div className="panel-title">
                <div>
                  <h2>รูปแบบการรับอาหาร</h2>
                  <p>เลือกรูปแบบที่สะดวกสำหรับคุณ</p>
                </div>
              </div>

              <div className="service-options">
                <button
                  className={`service-option ${
                    orderType === 'dine' ? 'selected' : ''
                  }`}
                  onClick={() => setOrderType('dine')}
                >
                  <span className="service-icon">
                    <Utensils size={21} />
                  </span>
                  <span>
                    <b>ทานที่ร้าน</b>
                    <small>Dine in</small>
                  </span>
                  <i className="radio-dot" />
                </button>

                <button
                  className={`service-option ${
                    orderType === 'takeaway' ? 'selected' : ''
                  }`}
                  onClick={() => setOrderType('takeaway')}
                >
                  <span className="service-icon">
                    <ShoppingBasket size={21} />
                  </span>
                  <span>
                    <b>กลับบ้าน</b>
                    <small>Take away</small>
                  </span>
                  <i className="radio-dot" />
                </button>
              </div>

              {orderType === 'dine' && (
                <div className="table-select">
                  <label htmlFor="table-choice">เลือกโต๊ะอาหาร</label>

                  <div className="select-wrap">
                    <select
                      id="table-choice"
                      value={table}
                      onChange={e => setTable(e.target.value)}
                    >
                      {tableOptions.map(option => (
                        <option
                          key={option}
                          value={option}
                          disabled={
                            occupiedTables.includes(option) &&
                            option !== table
                          }
                        >
                          {option}
                          {occupiedTables.includes(option)
                            ? ' (กำลังใช้งาน)'
                            : ' (ว่าง)'}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={17} />
                  </div>

                  <span className="table-status">
                    <i />
                    {occupiedTables.includes(table)
                      ? 'โต๊ะกำลังใช้งาน'
                      : 'โต๊ะว่าง'}
                  </span>
                </div>
              )}
            </div>
          </section>

          <aside className="right-column">
            <div className="panel summary-panel">
              <div className="panel-title">
                <div>
                  <h2>สรุปคำสั่งซื้อ</h2>
                  <p>Order summary</p>
                </div>

                <div className="summary-bag">
                  <ShoppingBag size={18} />
                </div>
              </div>

              <div className="summary-lines">
                <div>
                  <span>ยอดรวมสินค้า ({count} ชิ้น)</span>
                  <b>{money(subtotal)}</b>
                </div>

                <div>
                  <span>ส่วนลด</span>
                  <b className="discount">
                    {discount ? `-${money(discount)}` : money(0)}
                  </b>
                </div>

                <div>
                  <span>ค่าบริการ</span>
                  <b>{money(0)}</b>
                </div>
              </div>

              <div className="coupon-box">
                <div className="coupon-input">
                  <Tag size={17} />
                  <input
                    value={coupon}
                    onChange={e => setCoupon(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && applyCoupon()}
                    placeholder="กรอกโค้ดส่วนลด"
                  />
                </div>

                <button onClick={applyCoupon}>ใช้โค้ด</button>
              </div>

              {couponMessage && (
                <div
                  className={
                    couponApplied ? 'coupon-success' : 'coupon-error'
                  }
                >
                  {couponApplied ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <AlertCircle size={14} />
                  )}
                  {couponMessage}
                </div>
              )}

              <div className="total-row">
                <span>ยอดชำระทั้งหมด</span>
                <b>{money(total)}</b>
              </div>

              <div className="payment-title">
                ช่องทางการชำระเงิน
              </div>

              <div className="payment-options">
                <button
                  className={
                    payment === 'promptpay'
                      ? 'payment-option chosen'
                      : 'payment-option'
                  }
                  onClick={() => setPayment('promptpay')}
                >
                  <span className="payment-symbol prompt">▦</span>
                  <span>
                    <b>พร้อมเพย์ / QR</b>
                    <small>PromptPay</small>
                  </span>
                  <i className="radio-dot" />
                </button>

                <button
                  className={
                    payment === 'cash'
                      ? 'payment-option chosen'
                      : 'payment-option'
                  }
                  onClick={() => setPayment('cash')}
                >
                  <span className="payment-symbol cash">
                    <Banknote size={19} />
                  </span>
                  <span>
                    <b>เงินสด</b>
                    <small>Cash</small>
                  </span>
                  <i className="radio-dot" />
                </button>

                <button
                  className={
                    payment === 'card'
                      ? 'payment-option chosen'
                      : 'payment-option'
                  }
                  onClick={() => setPayment('card')}
                >
                  <span className="payment-symbol card">
                    <CreditCard size={19} />
                  </span>
                  <span>
                    <b>บัตรเครดิต / เดบิต</b>
                    <small>Credit / Debit</small>
                  </span>
                  <i className="radio-dot" />
                </button>
              </div>

              {payment === 'cash' && (
                <div className="cash-panel">
                  <label htmlFor="cash-received">
                    รับเงินจากลูกค้า
                  </label>

                  <div className="cash-input-wrap">
                    <span>฿</span>
                    <input
                      id="cash-received"
                      type="number"
                      min="0"
                      value={cashReceived}
                      onChange={e => setCashReceived(e.target.value)}
                      placeholder="กรอกจำนวนเงิน"
                    />
                  </div>

                  <div className="change-row">
                    <span>เงินทอน</span>
                    <b>{money(change)}</b>
                  </div>

                  {cashReceived !== '' &&
                    Number(cashReceived) < total && (
                      <small className="cash-warning">
                        จำนวนเงินยังไม่เพียงพอ
                      </small>
                    )}
                </div>
              )}

              {payment === 'promptpay' && (
                <div className="qr-hint">
                  <QrCode size={16} />
                  ระบบจะแสดง QR สำหรับชำระเงินในขั้นตอนถัดไป
                </div>
              )}

              <button
                className="checkout-button"
                disabled={
                  !items.length ||
                  !cashIsEnough ||
                  (payment === 'cash' && cashReceived === '')
                }
                onClick={confirmOrder}
              >
                ตรวจสอบและยืนยันคำสั่งซื้อ
                <span>→</span>
              </button>

              <div className="secure-note">
                <ShieldCheck size={15} />
                ข้อมูลการชำระเงินของคุณปลอดภัย
              </div>
            </div>

            <div className="info-note">
              <div className="info-icon">
                <Clock3 size={18} />
              </div>
              <div>
                <b>เวลาเตรียมอาหารโดยประมาณ</b>
                <p>15–25 นาที หลังจากยืนยันคำสั่งซื้อ</p>
              </div>
            </div>
          </aside>
        </div>

        <footer className="footer">
          <span>© 2026 VELOPOS. All rights reserved.</span>
          <span>
            Fresh food, easy order <span className="footer-heart">♥</span>
          </span>
        </footer>
      </main>

      {showUndo && removedItem && (
        <div className="undo-toast">
          <span>ลบ {removedItem.name} แล้ว</span>

          <button onClick={undoRemove}>
            <RotateCcw size={14} />
            เลิกทำ
          </button>

          <button
            className="toast-close"
            onClick={() => {
              setShowUndo(false)
              setRemovedItem(null)
            }}
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {editingItem && (
        <div
          className="modal-backdrop"
          onClick={() => setEditingItem(null)}
        >
          <div
            className="edit-modal"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setEditingItem(null)}
            >
              <X size={18} />
            </button>

            <div className="modal-kicker">CUSTOMIZE ITEM</div>
            <h2>แก้ไขรายละเอียดอาหาร</h2>
            <p className="edit-product-name">{editingItem.name}</p>

            <label htmlFor="edit-detail">
              รายละเอียด / ตัวเลือกอาหาร
            </label>
            <input
              id="edit-detail"
              value={editDetail}
              onChange={e => setEditDetail(e.target.value)}
              placeholder="เช่น ไม่ใส่ผัก, เผ็ดน้อย"
            />

            <label htmlFor="edit-note">หมายเหตุถึงครัว</label>
            <textarea
              id="edit-note"
              rows="3"
              value={editNote}
              onChange={e => setEditNote(e.target.value)}
              placeholder="ระบุคำขอเพิ่มเติม..."
            />

            <div className="modal-actions">
              <button
                className="modal-cancel"
                onClick={() => setEditingItem(null)}
              >
                ยกเลิก
              </button>

              <button className="modal-done" onClick={saveEditor}>
                บันทึกการแก้ไข
              </button>
            </div>
          </div>
        </div>
      )}

      {showQR && (
        <div
          className="modal-backdrop"
          onClick={() => setShowQR(false)}
        >
          <div
            className="success-modal qr-modal"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setShowQR(false)}
            >
              <X size={18} />
            </button>

            <div className="success-icon">
              <QrCode size={32} />
            </div>

            <h2>ชำระเงินผ่าน PromptPay</h2>
            <p>
              ตัวอย่าง QR สำหรับ Prototype เท่านั้น
              ยังไม่ได้เชื่อมต่อระบบรับชำระเงินจริง
            </p>

            <div className="mock-qr">
              <QrCode size={116} />
            </div>

            <div className="modal-total">
              <span>ยอดที่ต้องชำระ</span>
              <b>{money(total)}</b>
            </div>

            <button className="modal-done" onClick={finishOrder}>
              จำลองว่าชำระเงินแล้ว
            </button>
          </div>
        </div>
      )}

      {showSuccess && (
        <div
          className="modal-backdrop"
          onClick={() => setShowSuccess(false)}
        >
          <div
            className="success-modal"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setShowSuccess(false)}
            >
              <X size={18} />
            </button>

            <div className="success-icon">
              <CheckCircle2 size={34} />
            </div>

            <h2>ยืนยันคำสั่งซื้อเรียบร้อย!</h2>
            <p>
              นี่เป็นตัวอย่าง Prototype
              ยังไม่ได้ส่งคำสั่งซื้อไปยังระบบหลังบ้าน
            </p>

            <div className="modal-total">
              <span>รูปแบบ</span>
              <b>{orderType === 'dine' ? table : 'กลับบ้าน'}</b>
            </div>

            <div className="modal-total">
              <span>วิธีชำระเงิน</span>
              <b>
                {payment === 'cash'
                  ? 'เงินสด'
                  : payment === 'card'
                    ? 'บัตร'
                    : 'PromptPay'}
              </b>
            </div>

            <div className="modal-total">
              <span>ยอดชำระ</span>
              <b>{money(total)}</b>
            </div>

            {payment === 'cash' && (
              <div className="modal-total">
                <span>เงินทอน</span>
                <b>{money(change)}</b>
              </div>
            )}

            <button
              className="modal-done"
              onClick={() => setShowSuccess(false)}
            >
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  )
}