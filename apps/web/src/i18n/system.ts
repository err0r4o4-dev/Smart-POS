import { defineMessages } from './defineMessages';
export const system = defineMessages({
  th: {
    thisSpaceIsRestricted: 'พื้นที่นี้จำกัดสิทธิ์',
    nothingOnThisShelf: 'ไม่พบหน้านี้',
    yourAccountOrRoleCannotAccessThis:
      'บัญชีหรือบทบาทปัจจุบันไม่มีสิทธิ์เข้าถึงหน้านี้ กรุณากลับพื้นที่ทำงานหรือติดต่อเจ้าของร้าน',
    thisPageDoesNotExistOrIs:
      'หน้านี้ไม่มีอยู่ หรือเป็นฟีเจอร์ที่ยังไม่เปิดใช้งาน',
  },
  en: {
    thisSpaceIsRestricted: 'This space is restricted.',
    nothingOnThisShelf: 'Nothing on this shelf.',
    yourAccountOrRoleCannotAccessThis:
      'Your account or role cannot access this page. Return to your workspace or contact the store owner.',
    thisPageDoesNotExistOrIs:
      'This page does not exist or is a planned feature that is not yet available.',
  },
});
