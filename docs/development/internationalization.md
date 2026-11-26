# ภาษาใน SmartPOS frontend

ระบบรองรับ `th` และ `en` ผ่าน `apps/web/src/app/language.tsx` โดยมี
`LanguageProvider` อยู่เหนือ router ใน `providers.tsx` ทุก layout ใช้
`LanguageSwitcher` แบบปุ่มสองตัวจาก component เดียวกัน

เริ่มต้นเป็นไทยและเก็บค่าที่เลือกใน `localStorage` ภายใต้
`smartpos.language` ของ browser นี้ หาก storage ใช้ไม่ได้ยังสลับภาษาได้
ค่าภาษาไม่ซิงก์กับบัญชีผู้ใช้หรืออุปกรณ์อื่น การสลับภาษาไม่เปลี่ยน route,
query key, tenant, สิทธิ์, payload หรือข้อมูลฟอร์ม

## เพิ่มข้อความหรือหน้าใหม่

1. เพิ่มข้อความทั้งสองภาษาในไฟล์ feature ที่เกี่ยวข้องใน `apps/web/src/i18n`
   ใช้ key ที่บอกความหมาย และใช้ `defineMessages` ตรวจโครงสร้าง TH / EN
2. ถ้าเป็นหมวดใหม่ ให้ import และเพิ่มหมวดใน `messages.th` และ
   `messages.en` ของ `i18n/index.ts` ไม่ต้องแก้ `language.tsx`
3. เรียก `useLanguage()` ภายใน component และใช้ `t()` กับข้อความ UI
   ข้อความทั่วไป เช่น บันทึกและยกเลิก ใช้หมวด `common`

```tsx
const { t } = useLanguage();
return <button>{t('common.save')}</button>;
```

ใช้ placeholder สำหรับข้อมูลแทรก แทนการต่อประโยคที่ผูกกับภาษา:

```tsx
t('common.records', { count: total });
```

หากต้องเก็บข้อความที่มีตัวแปรใน state ให้เก็บ `UiMessage` ที่ประกอบด้วย
`key` และ `params` แล้วแสดงผ่าน `messageText()` ข้อความจึงเปลี่ยนตามภาษา
แม้แสดงไปแล้ว `localize()` รองรับ metadata และข้อความผิดพลาดเดิมที่ UI
เป็นเจ้าของเท่านั้น หน้าใหม่ควรใช้ `t()` โดยตรง

## ข้อมูลและการแสดงผล

- ชื่อสินค้า ลูกค้า ร้าน สาขา บันทึกส่วนตัว และข้อมูลที่ผู้ใช้กรอก
  แสดงตามข้อมูลต้นฉบับ ไม่ส่งไปแปลอัตโนมัติ
- `labelCode()` แปลข้อความแสดงสถานะหรือประเภทที่รู้จักเท่านั้น
  `value` ของ option ต้องคงเป็นรหัส API เดิมเสมอ รวมถึงกรณีที่เดิมใช้
  option text เป็น value โดยปริยาย รหัสที่ไม่รู้จักแสดงตามต้นฉบับ
- ข้อความผิดพลาดจาก client ที่รู้จักเปลี่ยนตามภาษาได้ ข้อความจาก server
  ที่ไม่มีคำแปลแสดงตามต้นฉบับ โดยไม่เปลี่ยนสัญญา API
- `formatDateTime()` รองรับ `date`, `time` และ `datetime` ใช้ ค.ศ.
  ทั้ง TH / EN และ timezone ของ browser เช่นเดียวกับการแสดงวันที่เดิม
  ไม่เปลี่ยน timestamp ที่ส่ง API
- จำนวนเงินและจำนวนสินค้ายังใช้ decimal string / bigint และ helper เดิม
  ไม่แปลงเป็น JavaScript number เพื่อจัดรูปแบบ
- คง `lang` ของเอกสารตามภาษาที่เลือก และแปล label, placeholder,
  validation, loading, empty state และข้อความสำหรับ accessibility

## การตรวจสอบ

`npm run test` ตรวจ keys และ placeholders ของคำแปล รวมถึง tests
ของแต่ละ feature การทดสอบ `language-integration.test.tsx` ครอบคลุม
การรักษาข้อมูลฟอร์ม ภาษาเมื่อเปลี่ยนหน้า และข้อความ validation ที่แสดงอยู่

`tests/e2e/language.spec.ts` ใช้ API จำลองและไม่อนุญาต writes เพื่อเช็ก
หน้าจอสาธารณะ management, staff และ POS โดยใช้ frontend ที่รันอยู่แล้ว
เลือก URL ผ่าน `E2E_BASE_URL` และ browser channel ที่ติดตั้งอยู่ผ่าน
`E2E_BROWSER_CHANNEL` ได้ การตรวจนี้ไม่ใช่หลักฐานธุรกรรมหรือสิทธิ์ backend

ยังต้องตรวจภาษาและการตัดบรรทัดบนหน้าจอจริงเมื่อเพิ่มหน้าใหม่
โดยเฉพาะปุ่ม ตาราง และข้อความภาษาอังกฤษที่ยาวกว่าไทย
