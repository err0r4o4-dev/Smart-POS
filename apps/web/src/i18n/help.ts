import { defineMessages } from './defineMessages';

export const help = defineMessages({
  th: {
    title: 'คู่มือใช้งานร้าน',
    eyebrow: 'ความช่วยเหลือ',
    description:
      'ศูนย์รวมขั้นตอนการใช้งาน แนะนำการเปิดกะ ระบบคิวครัว และการแก้ไขปัญหาเบื้องต้น',
    searchPlaceholder:
      'ค้นหาหัวข้อช่วยเหลือ เช่น เปิดกะ, คิวครัว, เงินทอน, คืนเงิน...',
    searchClear: 'ล้างการค้นหา',
    searchResultsCount: 'พบ {count} หัวข้อ',
    noResults: 'ไม่พบหัวข้อที่ค้นหา',
    noResultsHint:
      'ลองค้นหาด้วยคำอื่น เช่น "กะขาย", "ครัว", "ใบเสร็จ" หรือเลือกดูตามหมวดหมู่',
    categoryAll: 'ทั้งหมด',
    categoryGettingStarted: 'เริ่มต้นใช้งาน',
    categoryPos: 'จุดขาย POS',
    categoryKitchen: 'คิวครัว',
    categoryMenu: 'เมนูและสินค้า',
    categoryFaq: 'คำถามพบบ่อย',
    quickActionsTitle: 'ทางลัดไปยังระบบ',
    quickPos: 'แคชเชียร์ POS',
    quickPosDesc: 'เปิดกะ รับออเดอร์ คิดเงิน',
    quickKitchen: 'คิวครัว',
    quickKitchenDesc: 'ดูออเดอร์พร้อมทำและเปลี่ยนสถานะ',
    quickMenu: 'เมนูอาหาร',
    quickMenuDesc: 'จัดการรายการ ราคา และสต็อก',
    quickSettings: 'ตั้งค่าร้านค้า',
    quickSettingsDesc: 'ข้อมูลสาขาและเวลาทำการ',
    setupTitle: 'เตรียมร้านให้พร้อม',
    setupBody:
      'เลือกองค์กรและสาขาที่ต้องการทำงาน ตรวจสอบข้อมูลร้าน เวลาเปิดปิด และช่องทางรับออเดอร์ในหน้าตั้งค่า',
    setupStep1:
      'ตั้งค่าสาขา: ตรวจสอบที่อยู่ หมายเลขโทรศัพท์ และเวลาทำการของร้าน',
    setupStep2:
      'สิทธิ์การใช้งาน: กำหนดบทบาทพนักงานให้เหมาะสม (เจ้าของร้าน, ผู้จัดการ, แคชเชียร์, ครัว)',
    menuTitle: 'จัดการเมนูอาหารและสินค้า',
    menuBody:
      'เพิ่มเมนูและราคา แล้วเลือกสินค้าที่ต้องการเผยแพร่บนหน้าร้านออนไลน์ ตรวจสอบความพร้อมก่อนเปิดรับออเดอร์',
    menuStep1:
      'หมวดหมู่สินค้า: จัดกลุ่มอาหารหรือสินค้าเพื่อให้แคชเชียร์และลูกค้าเลือกได้สะดวก',
    menuStep2:
      'เปิด-ปิดการขาย: ปิดการขายสินค้านั้นชั่วคราวเมื่อวัตถุดิบหมดได้ทันที',
    posGuideTitle: 'การเปิดกะขายและการคิดเงินหน้าร้าน',
    posGuideBody:
      'แคชเชียร์ต้องเปิดกะระบุเงินทอนเริ่มต้นก่อนบันทึกการขาย รองรับการชำระด้วยเงินสด QR โอนเงิน และบัตร',
    posStep1:
      'เปิดกะ: ตรวจนับเงินทอนในลิ้นชักและบันทึกเงินเริ่มต้นก่อนเริ่มขาย',
    posStep2:
      'คิดเงิน: สรุปรายการ ยอดเงินรวม และเลือกวิธีชำระเงินที่ลูกค้าสะดวก',
    posStep3:
      'ปิดกะ: ตรวจนับเงินสดสุทธิในลิ้นชักและยืนยันยอดปิดกะเพื่อสรุปผลประจำวัน',
    ordersTitle: 'รับออเดอร์และส่งงานเข้าครัว',
    ordersBody:
      'ตรวจสอบรายการอาหารและสถานะการชำระเงินก่อนเริ่มทำอาหาร คิวครัวจะแสดงเฉพาะออเดอร์ที่ยืนยันการชำระเงินแล้ว',
    statusBody:
      'อัปเดตสถานะเมื่อเริ่มเตรียมอาหารและเมื่ออาหารพร้อมรับ หากใช้ POS ต้องมีสิทธิ์ใช้งานและเปิดกะก่อนขาย',
    kitchenStep1:
      'ตรวจสอบคิว: ออเดอร์ที่ชำระเงินสำเร็จจะปรากฏในหน้าคิวครัวโดยอัตโนมัติ',
    kitchenStep2:
      'เปลี่ยนสถานะ: กด "กำลังทำ" เมื่อเริ่มปรุง และกด "พร้อมรับ" เมื่ออาหารเสร็จ',
    trackingTitle: 'ติดตามออเดอร์และแก้ปัญหา',
    trackingBody:
      'ให้ลูกค้าเก็บลิงก์ติดตามออเดอร์ไว้ และไม่ส่งต่อให้ผู้อื่น หากยังไม่ทราบผลการชำระเงิน ให้ตรวจสอบสถานะก่อนลองชำระอีกครั้ง',
    recoveryBody:
      'หากโหลดข้อมูลไม่สำเร็จ ให้ลองใหม่ หากเข้าใช้งานบางหน้าไม่ได้ ให้ตรวจสอบสาขาที่เลือก และติดต่อผู้ดูแลร้านเพื่อตรวจสอบสิทธิ์',
    faqSectionTitle: 'คำถามที่พบบ่อย (FAQs)',
    faqKitchenQueueQ: 'ทำไมออเดอร์ใหม่ถึงไม่ปรากฏในหน้าคิวครัว?',
    faqKitchenQueueA:
      'ระบบครัวจะแสดงเฉพาะออเดอร์ที่ได้รับการชำระเงินแล้ว (PAID) เท่านั้น เพื่อป้องกันการเริ่มเตรียมอาหารก่อนยืนยันยอดเงิน กรุณาตรวจสอบสถานะการชำระเงินของออเดอร์ในหน้าขายหรือออเดอร์',
    faqPermissionQ: 'ทำไมเข้าบางหน้าแล้วขึ้นแจ้งเตือนว่าไม่มีสิทธิ์ใช้งาน?',
    faqPermissionA:
      'แต่ละบทบาทพนักงานมีสิทธิ์เข้าถึงต่างกัน เช่น เจ้าของร้านสามารถเข้าถึงได้ทุกหน้า ส่วนแคชเชียร์และฝ่ายครัวจะเข้าถึงเฉพาะหน้างานที่ได้รับมอบหมาย กรุณาติดต่อผู้ดูแลร้านเพื่อตรวจสอบบทบาท',
    faqShiftQ: 'หากเงินในลิ้นชักไม่ตรงกับยอดปิดกะต้องทำอย่างไร?',
    faqShiftA:
      'ตรวจสอบรายการเงินทอนเริ่มต้น ยอดขายเงินสด ประวัติการคืนเงิน และรายการบิลที่ยกเลิกระหว่างกะในหน้ารายงานการขาย',
    faqOfflineQ: 'หากการเชื่อมต่อขัดข้องหรือหน้าจอค้าง ควรดำเนินการอย่างไร?',
    faqOfflineA:
      'ตรวจสอบสัญญาณอินเทอร์เน็ต จากนั้นกดปุ่ม "ลองใหม่" (Retry) หรือรีเฟรชหน้าเบราว์เซอร์ ข้อมูลที่บันทึกแล้วจะไม่สูญหาย',
    faqOnlineOrderQ: 'ลูกค้าสามารถสั่งอาหารออนไลน์ได้อย่างไร?',
    faqOnlineOrderA:
      'ลูกค้าสามารถเข้าชมหน้าร้านออนไลน์ผ่านลิงก์ร้านค้า เลือกเมนู และส่งออเดอร์ได้ทันที โดยสถานะจะถูกส่งเข้ามาที่ระบบของร้าน',
    supportTitle: 'ต้องการความช่วยเหลือเพิ่มเติม?',
    supportDescription:
      'ทีมสนับสนุนพร้อมช่วยเหลือและตอบคำถามในการใช้งานระบบร้านค้าของคุณ',
    supportHours: 'เวลาทำการ: ทุกวัน 08:00 - 22:00 น.',
    supportContact: 'ติดต่อผู้ดูแลระบบร้านค้า หรือสอบถามผ่านอีเมลฝ่ายช่วยเหลือ',
  },
  en: {
    title: 'Store help',
    eyebrow: 'Help',
    description:
      'Operational guidelines, shift workflows, kitchen dispatching and troubleshooting.',
    searchPlaceholder:
      'Search help topics (e.g. shifts, kitchen queue, refunds)...',
    searchClear: 'Clear search',
    searchResultsCount: '{count} topics found',
    noResults: 'No matching help topics found',
    noResultsHint:
      'Try searching with different keywords or browse by category.',
    categoryAll: 'All',
    categoryGettingStarted: 'Getting Started',
    categoryPos: 'POS & Sales',
    categoryKitchen: 'Kitchen Queue',
    categoryMenu: 'Menu & Catalog',
    categoryFaq: 'FAQs & Issues',
    quickActionsTitle: 'Quick shortcuts',
    quickPos: 'POS Register',
    quickPosDesc: 'Open shift, take orders, checkout',
    quickKitchen: 'Kitchen Display',
    quickKitchenDesc: 'View incoming orders and update status',
    quickMenu: 'Menu & Catalog',
    quickMenuDesc: 'Manage items, prices and stock',
    quickSettings: 'Store Settings',
    quickSettingsDesc: 'Branch details and opening hours',
    setupTitle: 'Get your store ready',
    setupBody:
      'Select the organization and branch you want to work in. Check store details, opening hours and order channels in Settings.',
    setupStep1:
      'Branch settings: Check store address, phone number and business hours.',
    setupStep2:
      'Staff access: Assign roles appropriately (owner, manager, cashier, kitchen).',
    menuTitle: 'Menu and product management',
    menuBody:
      'Add menu items and prices, then choose which products to publish on your online storefront. Check availability before accepting orders.',
    menuStep1:
      'Categories: Group items so cashiers and online customers can find them quickly.',
    menuStep2:
      'Availability toggle: Quickly mark items unavailable when ingredients run out.',
    posGuideTitle: 'POS shift operations and checkout',
    posGuideBody:
      'Cashiers must open a shift with an opening float before selling. Supports cash, QR payment and card options.',
    posStep1:
      'Open shift: Count the drawer cash float and submit the starting amount.',
    posStep2:
      'Checkout: Review the item list, select payment method and issue the receipt.',
    posStep3:
      'Close shift: Count final drawer cash and confirm close-shift reconciliation.',
    ordersTitle: 'Handle orders and send them to the kitchen',
    ordersBody:
      'Check the items and payment status before starting preparation. Only orders with confirmed payment appear in the kitchen queue.',
    statusBody:
      'Update the status when preparation starts and when the food is ready. To sell through POS, you need POS access and an open shift.',
    kitchenStep1:
      'Queue review: Paid orders automatically appear in the kitchen display.',
    kitchenStep2:
      'Status change: Tap "Preparing" when cooking begins, then "Ready" when done.',
    trackingTitle: 'Track orders and resolve problems',
    trackingBody:
      'Ask customers to keep their tracking link private. If a payment result is uncertain, check its status before attempting another payment.',
    recoveryBody:
      'If data cannot be loaded, try again. If you cannot access a page, check the selected branch and ask your store administrator to review your access.',
    faqSectionTitle: 'Frequently Asked Questions',
    faqKitchenQueueQ: 'Why does a new order not appear in the kitchen queue?',
    faqKitchenQueueA:
      'The kitchen queue displays only confirmed paid orders to ensure preparation starts after payment. Please check the payment status in Orders or Sales.',
    faqPermissionQ:
      'Why do I see a permission notice when accessing certain pages?',
    faqPermissionA:
      'Each staff role has dedicated access. Owners can access all areas, while cashiers and kitchen staff have scoped permissions. Contact your store owner to review your role.',
    faqShiftQ:
      'What should I do if drawer cash does not match shift reconciliation?',
    faqShiftA:
      'Review starting float, cash sales, refund receipts and cancelled orders in the sales report.',
    faqOfflineQ:
      'What should I do if the connection drops or a screen freezes?',
    faqOfflineA:
      'Check internet connectivity, then tap "Retry" or refresh your browser. Confirmed records remain safe.',
    faqOnlineOrderQ: 'How do customers place online storefront orders?',
    faqOnlineOrderA:
      'Customers can visit the store link, select menu items and submit orders directly to your store.',
    supportTitle: 'Need additional help?',
    supportDescription:
      'Our support team is available to assist you with any questions or operational needs.',
    supportHours: 'Operating hours: Daily 08:00 - 22:00',
    supportContact:
      'Contact your store administrator or reach out via our support channel.',
  },
});
