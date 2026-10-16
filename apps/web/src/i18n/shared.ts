import { defineMessages } from './defineMessages';
export const shared = defineMessages({
  th: {
    storeOwner: 'เจ้าของร้าน',
    manager: 'ผู้จัดการ',
    inventoryStaff: 'พนักงานคลัง',
    purchasingStaff: 'พนักงานจัดซื้อ',
    loyaltyAndRewards: 'สมาชิกและรางวัล',
    customerDatabase: 'ฐานข้อมูลลูกค้า',
    pricing: 'ราคา',
    promotions: 'โปรโมชัน',
    discountApprovals: 'อนุมัติส่วนลด',
    customerReturns: 'คืนสินค้าลูกค้า',
    voidSale: 'กลับรายการขาย',
    refundTracking: 'ติดตามการคืนเงิน',
    openPos: 'เปิดหน้าขาย POS',
    inventoryStock: 'คลังสินค้า / สต็อก',
    purchasingReceiving: 'จัดซื้อ / รับสินค้า',
    shelvesReplenishment: 'ชั้นวาง / เติมสินค้า',
    storeSetupSelectOrganization: 'ตั้งค่าร้าน / เลือกองค์กร',
    inStoreSales: 'ขายหน้าร้าน',
    selectOrganizationAcceptInvitation: 'เลือกองค์กร / รับคำเชิญ',
    sales: 'การขาย',
    returnsAndRefunds: 'คืนสินค้าและคืนเงิน',
    customersAndMembers: 'ลูกค้าและสมาชิก',
    productsAndStock: 'สินค้าและสต็อก',
    purchasingAndSuppliers: 'จัดซื้อและซัพพลายเออร์',
    settingsAndUsers: 'ตั้งค่าและผู้ใช้งาน',
    inStoreSalesTasks: 'งานขายหน้าร้าน',
    productAndInventoryTasks: 'งานสินค้าและคลัง',
    purchasingTasks: 'งานจัดซื้อ',
    customersAndMembership: 'ข้อมูลลูกค้าและสมาชิก',
    code128Requires180AsciiCharacters: 'Code 128 ต้องเป็น ASCII 1–80 ตัวอักษร',
    invalidBarcodeChecksum: 'Barcode checksum ไม่ถูกต้อง',
    waitForTheCurrentOperationToFinish: 'กรุณารอให้รายการปัจจุบันเสร็จสิ้น',
    transactionSaved: 'บันทึกรายการแล้ว',
    posWorkspaceRequired: 'ต้องอยู่ในพื้นที่ขาย POS',
    scopeChanged: 'ขอบเขตการทำงานเปลี่ยนแล้ว',
    savedDataAndStockReflectTheServer:
      'บันทึกสำเร็จ — ข้อมูลและสต็อกแสดงตามผลจาก server',
    theApiOrItsDatabaseIsUnavailable:
      'API หรือฐานข้อมูลไม่พร้อม เริ่มระบบในเครื่องแล้วลองใหม่',
    theApiReturnedAnUnexpectedReadinessResponse:
      'API ส่งผลตรวจความพร้อมที่ไม่ถูกต้อง',
    sessionExpiredSignInAgain: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง',
    youDoNotHavePermissionToPerform: 'คุณไม่มีสิทธิ์ทำรายการนี้',
    dataChangedReloadTheLatestDataBefore:
      'ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนทำรายการ',
    tooManyRequestsWaitAMomentAnd:
      'มีคำขอมากเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง',
    serviceUnavailableTryLoadingAgain:
      'บริการไม่พร้อมใช้งาน กรุณาลองโหลดข้อมูลอีกครั้ง',
    connectionFailedCheckYourNetworkIfSaving:
      'เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ หากกำลังบันทึก ให้ตรวจสอบสถานะรายการก่อนทำซ้ำ',
    unableToReadResponseCheckTheTransaction:
      'อ่านผลตอบกลับไม่สำเร็จ กรุณาตรวจสอบสถานะรายการก่อนทำซ้ำ',
    invalidResponseFormatCheckTheTransactionStatus:
      'รูปแบบผลตอบกลับไม่ถูกต้อง กรุณาตรวจสอบสถานะรายการก่อนทำซ้ำ',
    enterAValidSkuVariantNameAnd:
      'ระบุ SKU, ชื่อ Variant และหน่วยนับให้ถูกต้อง',
    pricesAllowUpTo2DecimalPlaces:
      'ราคาเป็นทศนิยมไม่เกิน 2 ตำแหน่ง ราคาทุนไม่ติดลบ และราคาขายต้องมากกว่า 0',
    attributesRequireNonEmptyKeyValuePairs:
      'คุณลักษณะต้องเป็น key=value ที่ไม่ว่าง สูงสุด 12 รายการ',
    importUnavailable: 'ไม่สามารถนำเข้าได้',
    invalidQuantity: 'จำนวนไม่ถูกต้อง',
    invalidStripeSandboxDataCheckTheStatus:
      'ข้อมูล Stripe sandbox ไม่ถูกต้อง กรุณาตรวจสถานะใหม่',
    cash: 'เงินสด',
    qrManuallyVerified: 'QR — ยืนยันด้วยตนเอง',
    bankTransferManuallyVerified: 'โอนธนาคาร — ยืนยันด้วยตนเอง',
    exchangeCreditNotNewFunds: 'เครดิตเปลี่ยนสินค้า — ไม่ใช่เงินรับใหม่',
    zeroNetTotalNoFundsCollected: 'ยอดสุทธิศูนย์ — ไม่มีการรับเงิน',
    invalidStoreModeDataCheckSystemSettings:
      'ข้อมูลโหมดร้านไม่ถูกต้อง กรุณาตรวจการตั้งค่าระบบ',
    awaitingStoreReview: 'รอร้านตรวจสอบ',
    preparingProducts: 'กำลังเตรียมสินค้า',
    readyForPickup: 'พร้อมรับสินค้า',
    orderRejectedByStore: 'ร้านปฏิเสธออเดอร์',
    cancelled: 'ยกเลิกแล้ว',
    orderExpired: 'ออเดอร์หมดอายุ',
    unableToConnectToStorefrontTryAgain: 'เชื่อมต่อหน้าร้านไม่ได้ กรุณาลองใหม่',
  },
  en: {
    storeOwner: 'Store owner',
    manager: 'Manager',
    inventoryStaff: 'Inventory staff',
    purchasingStaff: 'Purchasing staff',
    loyaltyAndRewards: 'Loyalty and rewards',
    customerDatabase: 'Customer database',
    pricing: 'Pricing',
    promotions: 'Promotions',
    discountApprovals: 'Discount approvals',
    customerReturns: 'Customer returns',
    voidSale: 'Void sale',
    refundTracking: 'Refund tracking',
    openPos: 'Open POS',
    inventoryStock: 'Inventory / Stock',
    purchasingReceiving: 'Purchasing / Receiving',
    shelvesReplenishment: 'Shelves / Replenishment',
    storeSetupSelectOrganization: 'Store setup / Select organization',
    inStoreSales: 'In-store sales',
    selectOrganizationAcceptInvitation:
      'Select organization / Accept invitation',
    sales: 'Sales',
    returnsAndRefunds: 'Returns and refunds',
    customersAndMembers: 'Customers and members',
    productsAndStock: 'Products and stock',
    purchasingAndSuppliers: 'Purchasing and suppliers',
    settingsAndUsers: 'Settings and users',
    inStoreSalesTasks: 'In-store sales tasks',
    productAndInventoryTasks: 'Product and inventory tasks',
    purchasingTasks: 'Purchasing tasks',
    customersAndMembership: 'Customers and membership',
    code128Requires180AsciiCharacters:
      'Code 128 requires 1–80 ASCII characters',
    invalidBarcodeChecksum: 'Invalid barcode checksum',
    waitForTheCurrentOperationToFinish:
      'Wait for the current operation to finish',
    transactionSaved: 'Transaction saved',
    posWorkspaceRequired: 'POS workspace required',
    scopeChanged: 'Scope changed',
    savedDataAndStockReflectTheServer:
      'Saved — data and stock reflect the server result',
    theApiOrItsDatabaseIsUnavailable:
      'The API or its database is unavailable. Start the local stack, then retry.',
    theApiReturnedAnUnexpectedReadinessResponse:
      'The API returned an unexpected readiness response.',
    sessionExpiredSignInAgain: 'Session expired. Sign in again.',
    youDoNotHavePermissionToPerform:
      'You do not have permission to perform this action',
    dataChangedReloadTheLatestDataBefore:
      'Data changed. Reload the latest data before proceeding.',
    tooManyRequestsWaitAMomentAnd:
      'Too many requests. Wait a moment and retry.',
    serviceUnavailableTryLoadingAgain:
      'Service unavailable. Try loading again.',
    connectionFailedCheckYourNetworkIfSaving:
      'Connection failed. Check your network. If saving, check the transaction status before retrying.',
    unableToReadResponseCheckTheTransaction:
      'Unable to read response. Check the transaction status before retrying.',
    invalidResponseFormatCheckTheTransactionStatus:
      'Invalid response format. Check the transaction status before retrying.',
    enterAValidSkuVariantNameAnd: 'Enter a valid SKU, variant name and unit',
    pricesAllowUpTo2DecimalPlaces:
      'Prices allow up to 2 decimal places. Cost cannot be negative and selling price must be greater than 0.',
    attributesRequireNonEmptyKeyValuePairs:
      'Attributes require non-empty key=value pairs, up to 12 entries',
    importUnavailable: 'Import unavailable',
    invalidQuantity: 'Invalid quantity',
    invalidStripeSandboxDataCheckTheStatus:
      'Invalid Stripe sandbox data. Check the status again.',
    cash: 'Cash',
    qrManuallyVerified: 'QR — manually verified',
    bankTransferManuallyVerified: 'Bank transfer — manually verified',
    exchangeCreditNotNewFunds: 'Exchange credit — not new funds',
    zeroNetTotalNoFundsCollected: 'Zero net total — no funds collected',
    invalidStoreModeDataCheckSystemSettings:
      'Invalid store mode data. Check system settings.',
    awaitingStoreReview: 'Awaiting store review',
    preparingProducts: 'Preparing products',
    readyForPickup: 'Ready for pickup',
    orderRejectedByStore: 'Order rejected by store',
    cancelled: 'Cancelled',
    orderExpired: 'Order expired',
    unableToConnectToStorefrontTryAgain:
      'Unable to connect to storefront. Try again.',
  },
});
