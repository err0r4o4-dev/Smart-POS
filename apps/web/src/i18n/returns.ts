import { defineMessages } from './defineMessages';
export const returns = defineMessages({
  th: {
    returns: 'คืนสินค้า',
    refunds: 'คืนเงิน',
    posCheckout: 'ชำระเงิน POS',
    originalLot: 'ล็อตเดิม:',
    unknownReturnsMustBeQuarantined:
      '· lot ต้องตรงต้นทาง; ไม่ทราบให้เข้ากักกัน',
    revision5: '· เวอร์ชัน',
    refundDetails: 'รายละเอียดคืนเงิน',
    businessOperations: 'งานธุรกิจ',
    lotsMustMatchTheSourceUnknownReturns:
      '· ล็อตต้องตรงต้นทาง ไม่ทราบให้เข้ากักกัน',
  },
  en: {
    returns: 'Returns',
    refunds: 'Refunds',
    posCheckout: 'POS checkout',
    originalLot: 'Original lot:',
    unknownReturnsMustBeQuarantined: 'Unknown returns must be quarantined.',
    revision5: '· revision',
    refundDetails: 'REFUND DETAILS',
    businessOperations: 'BUSINESS OPERATIONS',
    lotsMustMatchTheSourceUnknownReturns:
      '· Lots must match the source; unknown returns must be quarantined.',
  },
});
