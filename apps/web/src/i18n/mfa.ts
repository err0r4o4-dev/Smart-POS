import { defineMessages } from './defineMessages';

export const mfa = defineMessages({
  th: {
    requiredTitle: 'ต้องยืนยัน MFA',
    creationUnknown:
      'ยังไม่ทราบผลการสร้างร้าน ตรวจร้านของคุณก่อน หรือส่งซ้ำด้วยข้อมูลเดิมในแท็บนี้ ห้ามเริ่มคำขอใหม่หรือปิดแท็บนี้จนกว่าจะทราบผล',
    requiredHelp:
      'ยืนยัน MFA สำหรับเซสชันนี้ก่อนสร้างหรือเข้าถึงร้าน เปิดความปลอดภัยของบัญชีเพื่อตั้งค่าหรือยืนยันรหัสจากแอป',
    securityNewTab: 'เปิดความปลอดภัยของบัญชี (แท็บใหม่)',
    returnToRetry:
      'ยืนยันเสร็จแล้ว กลับแท็บนี้และลองรายการเดิมอีกครั้ง ข้อมูลร้านจะยังอยู่',
    creationSignin:
      'เข้าสู่ระบบอีกครั้ง แล้วกรอกข้อมูลร้านเดิมเพื่อส่งซ้ำด้วยคำขอเดิม ร้านอาจถูกสร้างแล้ว ตรวจร้านของคุณก่อนเริ่มใหม่',
    creationChanged:
      'ยังไม่ทราบผลการสร้างร้านครั้งก่อน กรุณาคืนข้อมูลร้านเดิมก่อนลองอีกครั้ง หรือตรวจร้านของคุณในพื้นที่ทำงาน',
    creationStorage:
      'บันทึกข้อมูลสำหรับกู้คำขอไม่ได้ จึงยังไม่ส่งคำขอสร้างร้าน เปิดใช้พื้นที่จัดเก็บของเบราว์เซอร์และลองอีกครั้ง หากเคยส่งแล้ว ให้ตรวจร้านของคุณก่อน',
    completionStorage:
      'บันทึกหรืออ่านคีย์กู้คำขอไม่ได้ จึงยังไม่ส่งคำขอเปิดร้าน เปิดใช้พื้นที่จัดเก็บของเบราว์เซอร์และลองอีกครั้ง หากเคยส่งแล้ว ให้ตรวจสถานะร้านก่อน อย่าล้างข้อมูลแท็บนี้จนกว่าจะทราบผล',
    title: 'ความปลอดภัยของบัญชี',
    intro: 'ใช้แอปยืนยันตัวตนเพื่อเพิ่มการป้องกันให้บัญชีของคุณ',
    checking: 'กำลังตรวจสอบ MFA…',
    begin: 'ตั้งค่าแอปยืนยันตัวตน',
    disabled: 'ยังไม่ได้เปิดใช้ MFA',
    enabled: 'เปิดใช้ MFA แล้ว',
    verified: 'ยืนยัน MFA สำหรับเซสชันนี้แล้ว',
    challenge: 'ยืนยันด้วยรหัสจากแอปเพื่อใช้งานในเซสชันนี้',
    key: 'คีย์ตั้งค่าแอปยืนยันตัวตน',
    keyHelp:
      'ในแอปยืนยันตัวตน เลือกป้อนคีย์เอง และใช้รหัสตามเวลา 6 หลักที่เปลี่ยนทุก 30 วินาที เก็บคีย์นี้เป็นความลับ',
    expiry: 'ตั้งค่าให้เสร็จก่อนเวลานี้ (server จะตรวจอายุอีกครั้ง):',
    code: 'รหัส 6 หลัก',
    enable: 'เปิดใช้ MFA',
    verify: 'ยืนยันรหัส',
    pending: 'กำลังดำเนินการ…',
    retry: 'ตรวจสอบสถานะอีกครั้ง',
    unavailable: 'ตรวจสอบ MFA ไม่สำเร็จ กรุณาลองตรวจสอบสถานะอีกครั้ง',
    invalid:
      'รหัสไม่ถูกต้องหรือหมดอายุ หากตั้งค่าต่อไม่ได้ ให้เข้าสู่ระบบอีกครั้งแล้วเริ่มตั้งค่าใหม่',
    limited:
      'ลองหลายครั้งเกินไป กรุณารออย่างน้อย 10 นาทีแล้วตรวจสอบสถานะอีกครั้ง',
    unknown: 'ยังยืนยันผลคำสั่งไม่ได้ กรุณาตรวจสอบสถานะก่อนส่งคำสั่งอีกครั้ง',
    missingCodes:
      'หากเปิดใช้แล้วแต่ไม่ได้รับรหัสกู้คืน แอปยืนยันตัวตนอาจยังใช้งานได้ ขณะนี้ยังสร้างรหัสกู้คืนใหม่หรือกู้คืนผ่านผู้ดูแลไม่ได้',
    codesTitle: 'เก็บรหัสกู้คืนของคุณ',
    codesHelp:
      'ขณะนี้ยังใช้รหัสกู้คืนไม่ได้ รหัสแสดงเฉพาะครั้งนี้ เก็บไว้ในที่ปลอดภัยนอกอุปกรณ์ยืนยันตัวตน หน้านี้ไม่บันทึกรหัสให้คุณ',
    acknowledged: 'ฉันเก็บรหัสเหล่านี้ไว้ในที่ปลอดภัยแล้ว',
    done: 'เสร็จแล้ว',
    leaveTitle: 'เก็บรหัสกู้คืนก่อนออกจากหน้านี้',
    leaveHelp:
      'เมื่อออกจากหน้านี้ คุณจะเปิดดูรหัสชุดนี้ซ้ำไม่ได้ การปิดเบราว์เซอร์หรือเปลี่ยนบัญชีอาจทำให้รหัสที่ยังไม่ได้เก็บหายไป',
    pendingLeaveTitle: 'การยืนยันอาจยังสำเร็จได้',
    pendingLeaveHelp:
      'ระบบอาจเปิดใช้ MFA แม้ออกจากหน้านี้ หากออกตอนนี้ คุณอาจไม่ได้รับรหัสกู้คืน อยู่หน้านี้เพื่อรอผล หรือออกแล้วตรวจสอบสถานะอีกครั้ง',
    pendingLeave: 'ออกจากหน้านี้',
    stay: 'อยู่หน้านี้ต่อ',
    leave: 'ออกและล้างรหัสบนหน้านี้',
    signin: 'เข้าสู่ระบบอีกครั้ง',
    signinHelp:
      'หลังเข้าสู่ระบบ ให้เปิดความปลอดภัยของบัญชีจากเมนูบัญชี แล้วเริ่มตั้งค่าใหม่',
    workspace: 'กลับพื้นที่ทำงาน',
  },
  en: {
    requiredTitle: 'MFA verification required',
    creationUnknown:
      'The creation outcome is unknown. Check your stores, or retry the same details in this tab. Keep this tab open and avoid starting a new request until the outcome is known.',
    requiredHelp:
      'Verify MFA for this session before creating or accessing a store. Open account security to set up or verify your authenticator.',
    securityNewTab: 'Open account security (new tab)',
    returnToRetry:
      'After verification, return to this tab and retry the same action. Your store details stay here.',
    creationSignin:
      'Sign in again, then enter the same store details to retry the original request. The store may already exist; check your stores before starting again.',
    creationChanged:
      'The previous creation outcome is unknown. Restore the original store details to retry, or check your stores in the workspace.',
    creationStorage:
      'Could not save request recovery details, so no creation request was sent. Enable browser storage and retry. If you submitted earlier, check your stores first.',
    completionStorage:
      'Could not save or read the recovery key, so no open-store request was sent. Enable browser storage and retry. If you submitted earlier, check the store status first. Keep this tab data until the outcome is known.',
    title: 'Account security',
    intro: 'Use an authenticator app to add protection to your account.',
    checking: 'Checking MFA…',
    begin: 'Set up authenticator',
    disabled: 'MFA is not enabled',
    enabled: 'MFA is enabled',
    verified: 'MFA verified for this session',
    challenge: 'Enter a code from your authenticator for this session.',
    key: 'Authenticator setup key',
    keyHelp:
      'In your authenticator, choose manual key entry and time-based, six-digit codes changing every 30 seconds. Keep this key private.',
    expiry: 'Complete setup before this time (the server checks expiry):',
    code: 'Six-digit code',
    enable: 'Enable MFA',
    verify: 'Verify code',
    pending: 'Working…',
    retry: 'Check status again',
    unavailable: 'Could not check MFA. Check status again to retry.',
    invalid:
      'The code is invalid or expired. If setup cannot continue, sign in again and restart setup.',
    limited:
      'Too many attempts. Wait at least 10 minutes before checking again.',
    unknown:
      'The operation outcome is unknown. Check status before sending another command.',
    missingCodes:
      'If MFA is enabled but recovery codes were not received, your authenticator may still work. Code regeneration and administrator recovery are not available yet.',
    codesTitle: 'Keep your recovery codes',
    codesHelp:
      'Using recovery codes is not available yet. Codes are shown only now. Store them safely away from your authenticator device. This page does not save them for you.',
    acknowledged: 'I have stored these codes somewhere safe',
    done: 'Done',
    leaveTitle: 'Keep your recovery codes before leaving',
    leaveHelp:
      'After leaving, you cannot view this set again. Closing the browser or changing accounts may also lose codes you have not stored.',
    pendingLeaveTitle: 'Confirmation may still complete',
    pendingLeaveHelp:
      'MFA may become enabled even if you leave. Leaving now could lose your recovery codes. Stay to receive the result, or leave and check status again.',
    pendingLeave: 'Leave this page',
    stay: 'Stay here',
    leave: 'Leave and clear displayed codes',
    signin: 'Sign in again',
    signinHelp:
      'After signing in, open Account security from your account menu and restart setup.',
    workspace: 'Back to workspace',
  },
});
