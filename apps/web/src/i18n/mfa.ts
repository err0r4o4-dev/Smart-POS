import { defineMessages } from './defineMessages';

export const mfa = defineMessages({
  th: {
    requiredTitle: 'ยืนยันตัวตนเพิ่มเติม',
    goToVerification: 'ไปยืนยันตัวตน',
    creationUnknown:
      'ยังไม่ทราบผลการสร้างร้าน ตรวจร้านของคุณก่อน หรือส่งซ้ำด้วยข้อมูลเดิมในแท็บนี้ ห้ามเริ่มคำขอใหม่หรือปิดแท็บนี้จนกว่าจะทราบผล',
    requiredHelp:
      'เพื่อความปลอดภัย ให้ตั้งค่าแอปยืนยันตัวตนหรือกรอกรหัสจากแอปก่อนดำเนินการต่อ',
    securityNewTab: 'ไปที่การยืนยันตัวตน 2 ขั้นตอน (เปิดแท็บใหม่)',
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
    title: 'การยืนยันตัวตน 2 ขั้นตอน',
    intro: 'ใช้แอปยืนยันตัวตนเพื่อเพิ่มการป้องกันให้บัญชีของคุณ',
    checking: 'กำลังตรวจสอบการยืนยันตัวตน…',
    begin: 'ตั้งค่าแอปยืนยันตัวตน',
    disabled: 'ยังไม่ได้ตั้งค่าแอปยืนยันตัวตน',
    enabled: 'ตั้งค่าแอปยืนยันตัวตนแล้ว',
    verified: 'ยืนยันตัวตนเรียบร้อยแล้ว',
    challenge: 'เปิดแอปยืนยันตัวตน แล้วกรอกรหัส 6 หลักที่แอปแสดง',
    qrHelp:
      'สแกนคิวอาร์โค้ดนี้ด้วยแอปยืนยันตัวตน เช่น Google Authenticator หรือ Microsoft Authenticator แล้วกรอกรหัส 6 หลักที่แอปแสดง',
    qrLabel: 'คิวอาร์โค้ดสำหรับตั้งค่าแอปยืนยันตัวตน',
    manualKey: 'สแกนไม่ได้? ใส่คีย์เอง',
    staleSignin:
      'ต้องเริ่มตั้งค่าภายใน 5 นาทีหลังเข้าสู่ระบบ กรุณาเข้าสู่ระบบอีกครั้ง แล้วระบบจะพากลับมาหน้านี้เพื่อตั้งค่าต่อ',
    key: 'คีย์ตั้งค่าแอปยืนยันตัวตน',
    keyHelp:
      'ในแอปยืนยันตัวตน เลือกป้อนคีย์เอง และใช้รหัสตามเวลา 6 หลักที่เปลี่ยนทุก 30 วินาที เก็บคีย์นี้เป็นความลับ',
    expiry: 'ตั้งค่าให้เสร็จก่อนเวลานี้ (server จะตรวจอายุอีกครั้ง):',
    code: 'รหัส 6 หลัก',
    enable: 'เปิดใช้การยืนยันตัวตน 2 ขั้นตอน',
    verify: 'ยืนยันรหัส',
    startRecovery: 'ใช้รหัสกู้คืน',
    recoveryCode: 'รหัสกู้คืน',
    recoveryHelp:
      'ใช้รหัสกู้คืนที่ยังไม่เคยใช้ หลังเข้าสู่ระบบด้วยรหัสผ่านหรือ Google ภายใน 5 นาที',
    stageReplacement: 'ตั้งค่าแอปใหม่',
    cancelRecovery: 'ยกเลิกการกู้คืน',
    replacementHelp:
      'ป้อนรหัสจากแอปที่ตั้งค่าด้วยคีย์ใหม่ แอปเดิมยังใช้ได้จนกว่าจะยืนยันสำเร็จ',
    replace: 'ยืนยันการเปลี่ยนแอป',
    replaced:
      'เปลี่ยนแอปยืนยันตัวตนแล้ว เซสชันเดิมทั้งหมดสิ้นสุด เข้าสู่ระบบอีกครั้ง เปิดหน้าการยืนยันตัวตน 2 ขั้นตอน แล้วใช้รหัสจากแอปใหม่',
    replacementUnknown:
      'ยังยืนยันไม่ได้ว่าเปลี่ยนแอปแล้วหรือไม่ เข้าสู่ระบบอีกครั้งแล้วลองรหัสจากแอปใหม่ก่อน หากยังไม่เปลี่ยน แอปเดิมจะยังใช้ได้ ระบบจะไม่แสดงรหัสกู้คืนจากคำขอนี้ซ้ำ',
    replacementLeaveHelp:
      'ระบบอาจเปลี่ยนแอปแม้ออกจากหน้านี้ หากออกตอนนี้ คุณอาจไม่ได้รับรหัสกู้คืนชุดใหม่',
    signinAgain: 'เข้าสู่ระบบอีกครั้ง',
    pending: 'กำลังดำเนินการ…',
    retry: 'ตรวจสอบสถานะอีกครั้ง',
    unavailable: 'ตรวจสอบสถานะการยืนยันตัวตนไม่ได้ กรุณาลองอีกครั้ง',
    invalid:
      'รหัสไม่ถูกต้องหรือหมดอายุ หากตั้งค่าต่อไม่ได้ ให้เข้าสู่ระบบอีกครั้งแล้วเริ่มตั้งค่าใหม่',
    limited:
      'ลองหลายครั้งเกินไป กรุณารออย่างน้อย 10 นาทีแล้วตรวจสอบสถานะอีกครั้ง',
    unknown: 'ยังยืนยันผลคำสั่งไม่ได้ กรุณาตรวจสอบสถานะก่อนส่งคำสั่งอีกครั้ง',
    missingCodes:
      'หากเปิดใช้แล้วแต่ไม่ได้รับรหัสกู้คืน แอปยืนยันตัวตนอาจยังใช้งานได้ ขณะนี้ยังสร้างรหัสกู้คืนใหม่หรือกู้คืนผ่านผู้ดูแลไม่ได้',
    codesTitle: 'เก็บรหัสกู้คืนของคุณ',
    codesHelp:
      'รหัสแสดงเฉพาะครั้งนี้ เก็บไว้ในที่ปลอดภัยนอกอุปกรณ์ยืนยันตัวตน หน้านี้ไม่บันทึกรหัสให้คุณ',
    acknowledged: 'ฉันเก็บรหัสเหล่านี้ไว้ในที่ปลอดภัยแล้ว',
    done: 'เสร็จแล้ว',
    leaveTitle: 'เก็บรหัสกู้คืนก่อนออกจากหน้านี้',
    leaveHelp:
      'เมื่อออกจากหน้านี้ คุณจะเปิดดูรหัสชุดนี้ซ้ำไม่ได้ การปิดเบราว์เซอร์หรือเปลี่ยนบัญชีอาจทำให้รหัสที่ยังไม่ได้เก็บหายไป',
    pendingLeaveTitle: 'การยืนยันอาจยังสำเร็จได้',
    pendingLeaveHelp:
      'ระบบอาจเปิดใช้การยืนยันตัวตน 2 ขั้นตอน แม้ออกจากหน้านี้ หากออกตอนนี้ คุณอาจไม่ได้รับรหัสกู้คืน อยู่หน้านี้เพื่อรอผล หรือออกแล้วตรวจสอบสถานะอีกครั้ง',
    pendingLeave: 'ออกจากหน้านี้',
    stay: 'อยู่หน้านี้ต่อ',
    leave: 'ออกและล้างรหัสบนหน้านี้',
    signin: 'เข้าสู่ระบบอีกครั้ง',
    signinHelp:
      'หลังเข้าสู่ระบบ ให้เลือกการยืนยันตัวตน 2 ขั้นตอนจากเมนูบัญชี แล้วเริ่มตั้งค่าใหม่',
    workspace: 'กลับพื้นที่ทำงาน',
  },
  en: {
    requiredTitle: 'Verify your identity',
    goToVerification: 'Go to identity verification',
    creationUnknown:
      'The creation outcome is unknown. Check your stores, or retry the same details in this tab. Keep this tab open and avoid starting a new request until the outcome is known.',
    requiredHelp:
      'For your security, set up an authenticator app or enter a code from it before continuing.',
    securityNewTab: 'Open two-step verification (new tab)',
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
    title: 'Two-step verification',
    intro: 'Use an authenticator app to add protection to your account.',
    checking: 'Checking verification status…',
    begin: 'Set up authenticator',
    disabled: 'Two-step verification is off',
    enabled: 'Two-step verification is on',
    verified: 'Identity verified for this session',
    challenge:
      'Open your authenticator app and enter the six-digit code it shows.',
    qrHelp:
      'Scan this QR code with an authenticator app such as Google Authenticator or Microsoft Authenticator, then enter the six-digit code it shows.',
    qrLabel: 'QR code for setting up your authenticator app',
    manualKey: "Can't scan? Enter the key manually",
    staleSignin:
      'Setup must start within 5 minutes of signing in. Sign in again and you will return here to continue setup.',
    key: 'Authenticator setup key',
    keyHelp:
      'In your authenticator, choose manual key entry and time-based, six-digit codes changing every 30 seconds. Keep this key private.',
    expiry: 'Complete setup before this time (the server checks expiry):',
    code: 'Six-digit code',
    enable: 'Turn on two-step verification',
    verify: 'Verify code',
    startRecovery: 'Use a recovery code',
    recoveryCode: 'Recovery code',
    recoveryHelp:
      'Use an unused recovery code within five minutes of signing in with your password or Google.',
    stageReplacement: 'Set up replacement',
    cancelRecovery: 'Cancel recovery',
    replacementHelp:
      'Enter a code from the authenticator you set up with the new key. Your old authenticator works until confirmation succeeds.',
    replace: 'Replace authenticator',
    replaced:
      'Your authenticator was replaced and all previous sessions ended. Sign in again, open Two-step verification, and use a code from the new authenticator.',
    replacementUnknown:
      'We could not confirm whether your authenticator changed. Sign in again and try the new authenticator first. If nothing changed, the old authenticator still works. Recovery codes from this request cannot be shown again.',
    replacementLeaveHelp:
      'Your authenticator may change even if you leave. Leaving now could mean losing the new recovery codes.',
    signinAgain: 'Sign in again',
    pending: 'Working…',
    retry: 'Check status again',
    unavailable: 'Could not check verification status. Please try again.',
    invalid:
      'The code is invalid or expired. If setup cannot continue, sign in again and restart setup.',
    limited:
      'Too many attempts. Wait at least 10 minutes before checking again.',
    unknown:
      'The operation outcome is unknown. Check status before sending another command.',
    missingCodes:
      'If two-step verification is on but you did not receive recovery codes, your authenticator may still work. Code regeneration and administrator recovery are not available yet.',
    codesTitle: 'Keep your recovery codes',
    codesHelp:
      'Codes are shown only now. Store them safely away from your authenticator device. This page does not save them for you.',
    acknowledged: 'I have stored these codes somewhere safe',
    done: 'Done',
    leaveTitle: 'Keep your recovery codes before leaving',
    leaveHelp:
      'After leaving, you cannot view this set again. Closing the browser or changing accounts may also lose codes you have not stored.',
    pendingLeaveTitle: 'Confirmation may still complete',
    pendingLeaveHelp:
      'Two-step verification may turn on even if you leave. Leaving now could lose your recovery codes. Stay to receive the result, or leave and check status again.',
    pendingLeave: 'Leave this page',
    stay: 'Stay here',
    leave: 'Leave and clear displayed codes',
    signin: 'Sign in again',
    signinHelp:
      'After signing in, open Two-step verification from your account menu and restart setup.',
    workspace: 'Back to workspace',
  },
});
