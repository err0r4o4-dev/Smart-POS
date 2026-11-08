import { defineMessages } from './defineMessages';

export const help = defineMessages({
  th: {
    title: 'คู่มือใช้งานร้าน',
    eyebrow: 'ความช่วยเหลือ',
    description:
      'ขั้นตอนพื้นฐานสำหรับเตรียมร้าน รับออเดอร์ และติดตามงานในแต่ละวัน',
    setupTitle: 'เตรียมร้านให้พร้อม',
    setupBody:
      'เลือกองค์กรและสาขาที่ต้องการทำงาน ตรวจสอบข้อมูลร้าน เวลาเปิดปิด และช่องทางรับออเดอร์ในหน้าตั้งค่า',
    menuBody:
      'เพิ่มเมนูและราคา แล้วเลือกสินค้าที่ต้องการเผยแพร่บนหน้าร้านออนไลน์ ตรวจสอบความพร้อมก่อนเปิดรับออเดอร์',
    ordersTitle: 'รับออเดอร์และส่งงานเข้าครัว',
    ordersBody:
      'ตรวจสอบรายการอาหารและสถานะการชำระเงินก่อนเริ่มทำอาหาร คิวครัวจะแสดงเฉพาะออเดอร์ที่ยืนยันการชำระเงินแล้ว',
    statusBody:
      'อัปเดตสถานะเมื่อเริ่มเตรียมอาหารและเมื่ออาหารพร้อมรับ หากใช้ POS ต้องมีสิทธิ์ใช้งานและเปิดกะก่อนขาย',
    trackingTitle: 'ติดตามออเดอร์และแก้ปัญหา',
    trackingBody:
      'ให้ลูกค้าเก็บลิงก์ติดตามออเดอร์ไว้ และไม่ส่งต่อให้ผู้อื่น หากยังไม่ทราบผลการชำระเงิน ให้ตรวจสอบสถานะก่อนลองชำระอีกครั้ง',
    recoveryBody:
      'หากโหลดข้อมูลไม่สำเร็จ ให้ลองใหม่ หากเข้าใช้งานบางหน้าไม่ได้ ให้ตรวจสอบสาขาที่เลือกและติดต่อผู้ดูแลร้านเพื่อตรวจสอบสิทธิ์',
  },
  en: {
    title: 'Store help',
    eyebrow: 'Help',
    description:
      'The basics of setting up your store, handling orders and keeping daily work on track.',
    setupTitle: 'Get your store ready',
    setupBody:
      'Select the organization and branch you want to work in. Check store details, opening hours and order channels in Settings.',
    menuBody:
      'Add menu items and prices, then choose which products to publish on your online storefront. Check availability before accepting orders.',
    ordersTitle: 'Handle orders and send them to the kitchen',
    ordersBody:
      'Check the items and payment status before starting preparation. Only orders with confirmed payment appear in the kitchen queue.',
    statusBody:
      'Update the status when preparation starts and when the food is ready. To sell through POS, you need POS access and an open shift.',
    trackingTitle: 'Track orders and resolve problems',
    trackingBody:
      'Ask customers to keep their tracking link private. If a payment result is uncertain, check its status before attempting another payment.',
    recoveryBody:
      'If data cannot be loaded, try again. If you cannot access a page, check the selected branch and ask your store administrator to review your access.',
  },
});
