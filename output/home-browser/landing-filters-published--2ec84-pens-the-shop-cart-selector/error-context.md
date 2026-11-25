# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: landing.spec.ts >> filters published stores, keeps favorites, and opens the shop cart selector
- Location: tests\e2e\landing.spec.ts:87:5

# Error details

```
Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'ร้านโปรด' }) resolved to 3 elements:
    1) <button type="button" aria-pressed="false">…</button> aka getByRole('button', { name: 'ร้านโปรด', exact: true })
    2) <button type="button" aria-pressed="true" class="landing-shop-favorite" aria-label="บันทึก กะเพราพี่ต้น เป็นร้านโปรด">…</button> aka getByRole('button', { name: 'บันทึก กะเพราพี่ต้น เป็นร้านโปรด' })
    3) <button type="button" aria-pressed="false" class="landing-shop-favorite" aria-label="บันทึก Mr.Tea เป็นร้านโปรด">…</button> aka getByRole('button', { name: 'บันทึก Mr.Tea เป็นร้านโปรด' })

Call log:
  - waiting for getByRole('button', { name: 'ร้านโปรด' })

```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - link "ข้ามไปเนื้อหาหลัก" [ref=f1e4] [cursor=pointer]:
    - /url: "#landing-main"
  - banner [ref=f1e5]:
    - generic [ref=f1e6]:
      - link "VELO POS หน้าแรก" [ref=f1e7] [cursor=pointer]:
        - /url: /
        - generic [ref=f1e8]:
          - img "VELO Icon" [ref=f1e10]
          - generic [ref=f1e11]:
            - text: VELOPOS
            - generic [ref=f1e12]: SMART POS PLATFORM
      - navigation "เมนูหน้าแรก" [ref=f1e14]:
        - generic [ref=f1e15]:
          - link "หน้าหลัก" [ref=f1e16] [cursor=pointer]:
            - /url: /
          - link "สำรวจร้าน" [ref=f1e20] [cursor=pointer]:
            - /url: /shop
          - link "พื้นที่และชุมชน" [ref=f1e24] [cursor=pointer]:
            - /url: "#landing-areas"
          - link "หมวดหมู่อาหาร" [ref=f1e28] [cursor=pointer]:
            - /url: "#landing-categories"
        - generic [ref=f1e34]:
          - link "ตะกร้าสินค้า" [ref=f1e35] [cursor=pointer]:
            - /url: /shop?view=cart
          - link "สำหรับร้านค้า" [ref=f1e41] [cursor=pointer]:
            - /url: "#for-merchants"
          - link "เข้าสู่ระบบ" [ref=f1e46] [cursor=pointer]:
            - /url: /login
  - main [ref=f1e47]:
    - region [ref=f1e48]:
      - generic [ref=f1e51]:
        - link "มศว องครักษ์ เปลี่ยนพื้นที่" [ref=f1e52] [cursor=pointer]:
          - /url: "#landing-areas"
          - text: มศว องครักษ์
          - generic [ref=f1e58]: เปลี่ยนพื้นที่
        - heading "ค้นหาร้านอาหารในชุมชนของคุณ" [level=1] [ref=f1e59]
        - paragraph [ref=f1e60]: สั่งอาหารจากร้านใกล้คุณ พร้อมรับที่ร้าน รับกลับบ้าน หรือจัดส่ง
        - search [ref=f1e61]:
          - searchbox "ค้นหาร้านอาหาร" [ref=f1e65]
          - button "ค้นหา" [ref=f1e66] [cursor=pointer]
        - generic [ref=f1e67]:
          - generic [ref=f1e68]: "กำลังนิยม:"
          - list [ref=f1e71]:
            - listitem [ref=f1e72]:
              - link "ข้าวกะเพรา" [ref=f1e73] [cursor=pointer]:
                - /url: /shop?q=%E0%B8%82%E0%B9%89%E0%B8%B2%E0%B8%A7%E0%B8%81%E0%B8%B0%E0%B9%80%E0%B8%9E%E0%B8%A3%E0%B8%B2
            - listitem [ref=f1e74]:
              - link "ก๋วยเตี๋ยว" [ref=f1e75] [cursor=pointer]:
                - /url: /shop?q=%E0%B8%81%E0%B9%8B%E0%B8%A7%E0%B8%A2%E0%B9%80%E0%B8%95%E0%B8%B5%E0%B9%8B%E0%B8%A2%E0%B8%A7
            - listitem [ref=f1e76]:
              - link "ชาไข่มุก" [ref=f1e77] [cursor=pointer]:
                - /url: /shop?q=%E0%B8%8A%E0%B8%B2%E0%B9%84%E0%B8%82%E0%B9%88%E0%B8%A1%E0%B8%B8%E0%B8%81
            - listitem [ref=f1e78]:
              - link "ของทอด" [ref=f1e79] [cursor=pointer]:
                - /url: /shop?q=%E0%B8%82%E0%B8%AD%E0%B8%87%E0%B8%97%E0%B8%AD%E0%B8%94
            - listitem [ref=f1e80]:
              - link "ส้มตำ" [ref=f1e81] [cursor=pointer]:
                - /url: /shop?q=%E0%B8%AA%E0%B9%89%E0%B8%A1%E0%B8%95%E0%B8%B3
    - region [ref=f1e82]:
      - generic [ref=f1e83]:
        - generic [ref=f1e84]:
          - heading "สำรวจร้านตามพื้นที่" [level=2] [ref=f1e89]
          - paragraph [ref=f1e90]: เลือกชื่อพื้นที่เพื่อใช้เป็นคำค้นหาร้าน
          - link "ดูพื้นที่ทั้งหมด" [ref=f1e92] [cursor=pointer]:
            - /url: /shop
        - list "พื้นที่และชุมชน" [ref=f1e95]:
          - listitem [ref=f1e96]:
            - link "มศว องครักษ์ ร้านอาหารรอบมหาวิทยาลัย" [ref=f1e97] [cursor=pointer]:
              - /url: /shop?q=%E0%B8%A1%E0%B8%A8%E0%B8%A7%20%E0%B8%AD%E0%B8%87%E0%B8%84%E0%B8%A3%E0%B8%B1%E0%B8%81%E0%B8%A9%E0%B9%8C
              - generic [ref=f1e98]:
                - strong [ref=f1e99]: มศว องครักษ์
                - generic [ref=f1e100]: ร้านอาหารรอบมหาวิทยาลัย
          - listitem [ref=f1e104]:
            - link "ตลาดมหาวิทยาลัย ร้านเด็ด สตรีทฟู้ด ราคานักศึกษา" [ref=f1e105] [cursor=pointer]:
              - /url: /shop?q=%E0%B8%95%E0%B8%A5%E0%B8%B2%E0%B8%94%E0%B8%A1%E0%B8%AB%E0%B8%B2%E0%B8%A7%E0%B8%B4%E0%B8%97%E0%B8%A2%E0%B8%B2%E0%B8%A5%E0%B8%B1%E0%B8%A2
              - generic [ref=f1e106]:
                - strong [ref=f1e107]: ตลาดมหาวิทยาลัย
                - generic [ref=f1e108]: ร้านเด็ด สตรีทฟู้ด ราคานักศึกษา
          - listitem [ref=f1e112]:
            - link "หอพักนิสิต ร้านอาหารใกล้หอพัก" [ref=f1e113] [cursor=pointer]:
              - /url: /shop?q=%E0%B8%AB%E0%B8%AD%E0%B8%9E%E0%B8%B1%E0%B8%81%E0%B8%99%E0%B8%B4%E0%B8%AA%E0%B8%B4%E0%B8%95
              - generic [ref=f1e114]:
                - strong [ref=f1e115]: หอพักนิสิต
                - generic [ref=f1e116]: ร้านอาหารใกล้หอพัก
          - listitem [ref=f1e120]:
            - link "ชุมชนคลอง 16 ร้านอาหารในย่านชุมชน" [ref=f1e121] [cursor=pointer]:
              - /url: /shop?q=%E0%B8%8A%E0%B8%B8%E0%B8%A1%E0%B8%8A%E0%B8%99%E0%B8%84%E0%B8%A5%E0%B8%AD%E0%B8%87%2016
              - generic [ref=f1e122]:
                - strong [ref=f1e123]: ชุมชนคลอง 16
                - generic [ref=f1e124]: ร้านอาหารในย่านชุมชน
    - region [ref=f1e128]:
      - generic [ref=f1e129]:
        - generic [ref=f1e130]:
          - heading "เลือกตามประเภทอาหาร" [level=2] [ref=f1e137]
          - link "ดูหมวดหมู่ทั้งหมด" [ref=f1e139] [cursor=pointer]:
            - /url: /shop
        - list "ประเภทอาหาร" [ref=f1e142]:
          - listitem [ref=f1e143]:
            - link "อาหารตามสั่ง" [ref=f1e144] [cursor=pointer]:
              - /url: /shop?q=%E0%B8%AD%E0%B8%B2%E0%B8%AB%E0%B8%B2%E0%B8%A3%E0%B8%95%E0%B8%B2%E0%B8%A1%E0%B8%AA%E0%B8%B1%E0%B9%88%E0%B8%87
          - listitem [ref=f1e145]:
            - link "ก๋วยเตี๋ยว" [ref=f1e146] [cursor=pointer]:
              - /url: /shop?q=%E0%B8%81%E0%B9%8B%E0%B8%A7%E0%B8%A2%E0%B9%80%E0%B8%95%E0%B8%B5%E0%B9%8B%E0%B8%A2%E0%B8%A7
          - listitem [ref=f1e147]:
            - link "อาหารอีสาน" [ref=f1e148] [cursor=pointer]:
              - /url: /shop?q=%E0%B8%AD%E0%B8%B2%E0%B8%AB%E0%B8%B2%E0%B8%A3%E0%B8%AD%E0%B8%B5%E0%B8%AA%E0%B8%B2%E0%B8%99
          - listitem [ref=f1e149]:
            - link "ของทอด" [ref=f1e150] [cursor=pointer]:
              - /url: /shop?q=%E0%B8%82%E0%B8%AD%E0%B8%87%E0%B8%97%E0%B8%AD%E0%B8%94
          - listitem [ref=f1e151]:
            - link "เครื่องดื่ม" [ref=f1e152] [cursor=pointer]:
              - /url: /shop?q=%E0%B9%80%E0%B8%84%E0%B8%A3%E0%B8%B7%E0%B9%88%E0%B8%AD%E0%B8%87%E0%B8%94%E0%B8%B7%E0%B9%88%E0%B8%A1
          - listitem [ref=f1e153]:
            - link "ของหวาน" [ref=f1e154] [cursor=pointer]:
              - /url: /shop?q=%E0%B8%82%E0%B8%AD%E0%B8%87%E0%B8%AB%E0%B8%A7%E0%B8%B2%E0%B8%99
          - listitem [ref=f1e155]:
            - link "อาหารสุขภาพ" [ref=f1e156] [cursor=pointer]:
              - /url: /shop?q=%E0%B8%AD%E0%B8%B2%E0%B8%AB%E0%B8%B2%E0%B8%A3%E0%B8%AA%E0%B8%B8%E0%B8%82%E0%B8%A0%E0%B8%B2%E0%B8%9E
          - listitem [ref=f1e157]:
            - link "อาหารทานเล่น" [ref=f1e158] [cursor=pointer]:
              - /url: /shop?q=%E0%B8%AD%E0%B8%B2%E0%B8%AB%E0%B8%B2%E0%B8%A3%E0%B8%97%E0%B8%B2%E0%B8%99%E0%B9%80%E0%B8%A5%E0%B9%88%E0%B8%99
    - region [ref=f1e159]:
      - generic [ref=f1e160]:
        - generic [ref=f1e161]:
          - heading "ร้านแนะนำ" [level=2] [ref=f1e165]
          - generic [ref=f1e166]:
            - group "ตัวกรองร้านแนะนำ" [ref=f1e167]:
              - button "แนะนำสำหรับคุณ" [pressed] [ref=f1e168] [cursor=pointer]
              - button "เปิดรับออเดอร์" [ref=f1e172] [cursor=pointer]
              - button "ร้านโปรด" [ref=f1e176] [cursor=pointer]
            - link "ดูร้านทั้งหมด" [ref=f1e179] [cursor=pointer]:
              - /url: /shop
        - list "ร้านแนะนำ" [ref=f1e183]:
          - listitem [ref=f1e184]:
            - article [ref=f1e185]:
              - generic [ref=f1e186]:
                - generic [ref=f1e187]: เปิดรับออเดอร์
                - button "บันทึก กะเพราพี่ต้น เป็นร้านโปรด" [pressed] [ref=f1e188] [cursor=pointer]
              - generic [ref=f1e191]:
                - generic [ref=f1e192]:
                  - heading [level=3] [ref=f1e193]:
                    - link "กะเพราพี่ต้น" [ref=f1e194] [cursor=pointer]:
                      - /url: /shop/krapao
                  - generic [ref=f1e195]: ร้านอาหาร
                - paragraph [ref=f1e196]: หน้าร้านออนไลน์
          - listitem [ref=f1e201]:
            - article [ref=f1e202]:
              - generic [ref=f1e203]:
                - generic [ref=f1e204]: ปิดรับออเดอร์
                - button "บันทึก Mr.Tea เป็นร้านโปรด" [ref=f1e205] [cursor=pointer]
              - generic [ref=f1e208]:
                - generic [ref=f1e209]:
                  - heading [level=3] [ref=f1e210]:
                    - link "Mr.Tea" [ref=f1e211] [cursor=pointer]:
                      - /url: /shop/mr-tea
                  - generic [ref=f1e212]: คาเฟ่
                - paragraph [ref=f1e213]: หน้าร้านออนไลน์
    - region [ref=f1e218]:
      - generic [ref=f1e220]:
        - generic [ref=f1e221]:
          - heading "สั่งอาหารง่าย ๆ ใน 3 ขั้นตอน" [level=2] [ref=f1e222]
          - paragraph [ref=f1e223]: สะดวก รวดเร็ว รองรับการสั่งล่วงหน้า
        - list "ขั้นตอนการสั่งอาหาร" [ref=f1e224]:
          - listitem [ref=f1e225]:
            - generic [ref=f1e230]:
              - strong [ref=f1e231]:
                - generic [ref=f1e232]: "1"
                - text: ค้นหาร้าน
              - generic [ref=f1e233]: เลือกพื้นที่หรือร้านที่สนใจ
          - listitem [ref=f1e236]:
            - generic [ref=f1e241]:
              - strong [ref=f1e242]:
                - generic [ref=f1e243]: "2"
                - text: สั่งอาหาร
              - generic [ref=f1e244]: เลือกเมนูและยืนยันคำสั่งซื้อ
          - listitem [ref=f1e247]:
            - generic [ref=f1e254]:
              - strong [ref=f1e255]:
                - generic [ref=f1e256]: "3"
                - text: รับอาหาร
              - generic [ref=f1e257]: ทานที่ร้าน รับกลับบ้าน หรือจัดส่ง
    - region [ref=f1e258]:
      - generic [ref=f1e260]:
        - generic [ref=f1e261]:
          - heading "มีร้านอาหารเป็นของตัวเอง?" [level=2] [ref=f1e262]
          - paragraph [ref=f1e263]: เข้าร่วม VELOPOS เปิดหน้าร้านออนไลน์ รับออเดอร์ และจัดการร้านในระบบเดียว
        - list "จุดเด่นสำหรับร้านค้า" [ref=f1e264]:
          - listitem [ref=f1e265]: ระบบ POS ใช้งานง่าย
          - listitem [ref=f1e268]: จัดการออเดอร์แบบเรียลไทม์
          - listitem [ref=f1e272]: สร้าง QR โต๊ะได้ทันที
          - listitem [ref=f1e279]: ดูยอดขายและรายงาน
        - link "สมัครร้านค้าฟรี" [ref=f1e283] [cursor=pointer]:
          - /url: /register
  - contentinfo [ref=f1e286]:
    - generic [ref=f1e287]:
      - navigation "ลิงก์ท้ายหน้า" [ref=f1e288]:
        - generic [ref=f1e289]:
          - heading "เกี่ยวกับ VELOPOS" [level=2] [ref=f1e290]
          - paragraph [ref=f1e291]: แพลตฟอร์มร้านอาหารในชุมชน เชื่อมต่อการสั่งอาหารและการจัดการร้านค้าในระบบเดียว
        - generic [ref=f1e292]:
          - heading "เมนูหลัก" [level=2] [ref=f1e293]
          - list [ref=f1e294]:
            - listitem [ref=f1e295]:
              - link "หน้าหลัก" [ref=f1e296] [cursor=pointer]:
                - /url: /
            - listitem [ref=f1e297]:
              - link "สำรวจร้าน" [ref=f1e298] [cursor=pointer]:
                - /url: /shop
            - listitem [ref=f1e299]:
              - link "พื้นที่และชุมชน" [ref=f1e300] [cursor=pointer]:
                - /url: "#landing-areas"
            - listitem [ref=f1e301]:
              - link "หมวดหมู่อาหาร" [ref=f1e302] [cursor=pointer]:
                - /url: "#landing-categories"
        - generic [ref=f1e303]:
          - heading "สำหรับร้านค้า" [level=2] [ref=f1e304]
          - list [ref=f1e305]:
            - listitem [ref=f1e306]:
              - link "สมัครร้านค้า" [ref=f1e307] [cursor=pointer]:
                - /url: /register
            - listitem [ref=f1e308]:
              - link "วิธีใช้งานร้านค้า" [ref=f1e309] [cursor=pointer]:
                - /url: /help
            - listitem [ref=f1e310]:
              - link "แพ็กเกจและค่าบริการ" [ref=f1e311] [cursor=pointer]:
                - /url: /help
        - generic [ref=f1e312]:
          - heading "ช่วยเหลือ" [level=2] [ref=f1e313]
          - list [ref=f1e314]:
            - listitem [ref=f1e315]:
              - link "คำถามที่พบบ่อย (FAQ)" [ref=f1e316] [cursor=pointer]:
                - /url: /help
            - listitem [ref=f1e317]:
              - link "ติดต่อเรา" [ref=f1e318] [cursor=pointer]:
                - /url: /help
            - listitem [ref=f1e319]:
              - link "แจ้งปัญหาการใช้งาน" [ref=f1e320] [cursor=pointer]:
                - /url: /help
        - generic [ref=f1e321]:
          - heading "ข้อกำหนด" [level=2] [ref=f1e322]
          - list [ref=f1e323]:
            - listitem [ref=f1e324]:
              - link "เงื่อนไขการใช้งาน" [ref=f1e325] [cursor=pointer]:
                - /url: /help
            - listitem [ref=f1e326]:
              - link "นโยบายความเป็นส่วนตัว" [ref=f1e327] [cursor=pointer]:
                - /url: /help
            - listitem [ref=f1e328]:
              - link "นโยบายคุกกี้" [ref=f1e329] [cursor=pointer]:
                - /url: /help
        - generic [ref=f1e330]:
          - heading "ติดต่อเรา" [level=2] [ref=f1e331]
          - list [ref=f1e332]:
            - listitem [ref=f1e333]:
              - link "ติดต่อเรา" [ref=f1e334] [cursor=pointer]:
                - /url: /help
            - listitem [ref=f1e337]:
              - link "คู่มือ" [ref=f1e338] [cursor=pointer]:
                - /url: /help
            - listitem [ref=f1e342]:
              - link "สำรวจร้าน" [ref=f1e343] [cursor=pointer]:
                - /url: /shop
      - generic [ref=f1e349]:
        - generic [ref=f1e350]: © 2026 VELOPOS. สงวนลิขสิทธิ์
        - link "เครดิตภาพถ่าย" [ref=f1e351] [cursor=pointer]:
          - /url: /images/home/photo-credits.html
        - generic [ref=f1e352]:
          - generic [ref=f1e356]: ภาษา
          - combobox "ภาษา" [ref=f1e357] [cursor=pointer]:
            - option "ภาษาไทย" [selected]
            - option "English"
```

# Test source

```ts
  6   |     name: 'กะเพราพี่ต้น',
  7   |     accepting_orders: true,
  8   |     business_type: 'RESTAURANT',
  9   |   },
  10  |   {
  11  |     slug: 'mr-tea',
  12  |     name: 'Mr.Tea',
  13  |     accepting_orders: false,
  14  |     business_type: 'CAFE',
  15  |   },
  16  | ];
  17  | 
  18  | test.beforeEach(async ({ page }) => {
  19  |   await page.route('**/api/**', (route) => route.abort());
  20  |   await page.route('**/api/v1/auth/me', (route) =>
  21  |     route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }),
  22  |   );
  23  |   await page.route('**/api/v1/storefronts', (route) =>
  24  |     route.fulfill({ json: { data: shops } }),
  25  |   );
  26  | });
  27  | 
  28  | for (const width of [320, 375, 767, 768, 1023, 1024, 1280, 1440, 1920]) {
  29  |   test(`home page fits the viewport at ${width}px`, async ({
  30  |     page,
  31  |   }, testInfo) => {
  32  |     await page.setViewportSize({ width, height: 1000 });
  33  |     const errors: string[] = [];
  34  |     page.on('pageerror', (error) => errors.push(error.message));
  35  |     await page.goto('/');
  36  |     await expect(page.getByRole('heading', { level: 1 })).toHaveText(
  37  |       'ค้นหาร้านอาหารในชุมชนของคุณ',
  38  |     );
  39  |     await expect(
  40  |       page.getByRole('list', { name: 'ร้านแนะนำ' }).getByRole('listitem'),
  41  |     ).toHaveCount(2);
  42  |     await expect(
  43  |       page.getByRole('navigation', { name: 'Main navigation' }),
  44  |     ).toHaveCount(0);
  45  |     expect(
  46  |       await page.evaluate(() => document.documentElement.scrollWidth),
  47  |     ).toBe(width);
  48  |     for (const container of await page.locator('.landing-container').all()) {
  49  |       const bounds = await container.boundingBox();
  50  |       if (!bounds) throw new Error('Landing container has no bounding box');
  51  |       const expectedWidth = Math.min(1284, width - (width >= 768 ? 48 : 32));
  52  |       expect(bounds.width).toBeCloseTo(expectedWidth, 0);
  53  |       expect(bounds.x).toBeCloseTo((width - expectedWidth) / 2, 0);
  54  |     }
  55  |     const header = await page.locator('.landing-header').boundingBox();
  56  |     expect(header!.height).toBeCloseTo(54, 0);
  57  |     await page.locator('main img').evaluateAll(async (images) => {
  58  |       await Promise.all(
  59  |         images.map((image) => (image as HTMLImageElement).decode()),
  60  |       );
  61  |     });
  62  |     await page.screenshot({
  63  |       path: testInfo.outputPath(`home-${width}.png`),
  64  |       fullPage: true,
  65  |       animations: 'disabled',
  66  |     });
  67  |     expect(errors).toEqual([]);
  68  |   });
  69  | }
  70  | 
  71  | test('hero search opens the shop directory with the query applied', async ({
  72  |   page,
  73  | }) => {
  74  |   await page.setViewportSize({ width: 1440, height: 900 });
  75  |   await page.goto('/');
  76  |   await page.getByRole('searchbox', { name: 'ค้นหาร้านอาหาร' }).fill('กะเพรา');
  77  |   await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  78  |   await expect(page).toHaveURL(/\/shop\?q=/);
  79  |   await expect(page.getByRole('searchbox', { name: 'ค้นหาร้าน' })).toHaveValue(
  80  |     'กะเพรา',
  81  |   );
  82  |   await expect(
  83  |     page.getByRole('heading', { name: 'กะเพราพี่ต้น' }),
  84  |   ).toBeVisible();
  85  | });
  86  | 
  87  | test('filters published stores, keeps favorites, and opens the shop cart selector', async ({
  88  |   page,
  89  | }) => {
  90  |   await page.setViewportSize({ width: 1440, height: 900 });
  91  |   await page.goto('/');
  92  |   const list = page.getByRole('list', {
  93  |     name: 'ร้านแนะนำ',
  94  |   });
  95  |   await page.getByRole('button', { name: 'เปิดรับออเดอร์' }).click();
  96  |   await expect(
  97  |     list.getByRole('link', { name: 'กะเพราพี่ต้น' }),
  98  |   ).toHaveAttribute('href', '/shop/krapao');
  99  |   await expect(list.getByRole('link', { name: 'Mr.Tea' })).toHaveCount(0);
  100 |   const favourite = page.getByRole('button', {
  101 |     name: 'บันทึก กะเพราพี่ต้น เป็นร้านโปรด',
  102 |   });
  103 |   await favourite.click();
  104 |   await expect(favourite).toHaveAttribute('aria-pressed', 'true');
  105 |   await page.reload();
> 106 |   await page.getByRole('button', { name: 'ร้านโปรด' }).click();
      |                                                        ^ Error: locator.click: Error: strict mode violation: getByRole('button', { name: 'ร้านโปรด' }) resolved to 3 elements:
  107 |   await expect(list.getByRole('link', { name: 'กะเพราพี่ต้น' })).toBeVisible();
  108 |   await page
  109 |     .getByRole('banner')
  110 |     .getByRole('link', { name: 'ตะกร้าสินค้า' })
  111 |     .click();
  112 |   await expect(
  113 |     page.getByRole('link', { name: 'เปิดตะกร้า' }).first(),
  114 |   ).toHaveAttribute('href', '/shop/krapao/cart');
  115 |   await page.goto('/');
  116 |   await page
  117 |     .getByRole('list', { name: 'ประเภทอาหาร' })
  118 |     .getByRole('link', { name: 'ก๋วยเตี๋ยว' })
  119 |     .click();
  120 |   await expect(page).toHaveURL(/\/shop\?q=/);
  121 |   await page.goto('/');
  122 |   await page.getByRole('link', { name: /สมัครร้านค้าฟรี/ }).click();
  123 |   await expect(page).toHaveURL(/\/register$/);
  124 |   await page.goto('/');
  125 |   await page
  126 |     .getByRole('banner')
  127 |     .getByRole('link', { name: 'เข้าสู่ระบบ' })
  128 |     .click();
  129 |   await expect(page).toHaveURL(/\/login$/);
  130 | });
  131 | 
  132 | test('mobile navigation exposes all destinations with the keyboard', async ({
  133 |   page,
  134 | }) => {
  135 |   await page.setViewportSize({ width: 320, height: 900 });
  136 |   await page.goto('/');
  137 |   const menu = page.getByRole('button', { name: 'เมนู' });
  138 |   await menu.waitFor({ state: 'visible' });
  139 |   await page.keyboard.press('Tab');
  140 |   await expect(
  141 |     page.getByRole('link', { name: 'ข้ามไปเนื้อหาหลัก' }),
  142 |   ).toBeFocused();
  143 |   await page.keyboard.press('Tab');
  144 |   await expect(
  145 |     page.getByRole('link', { name: 'VELO POS หน้าแรก' }),
  146 |   ).toBeFocused();
  147 |   await page.keyboard.press('Tab');
  148 |   await expect(menu).toBeFocused();
  149 |   await page.keyboard.press('Enter');
  150 |   await expect(menu).toHaveAttribute('aria-expanded', 'true');
  151 |   const navigation = page.getByRole('navigation', { name: 'เมนูหน้าแรก' });
  152 |   for (const name of ['หน้าหลัก', 'สำรวจร้าน', 'สำหรับร้านค้า', 'เข้าสู่ระบบ'])
  153 |     await expect(navigation.getByRole('link', { name })).toBeVisible();
  154 |   await navigation.getByRole('link', { name: 'หมวดหมู่อาหาร' }).click();
  155 |   await expect(
  156 |     page.getByRole('heading', { name: 'เลือกตามประเภทอาหาร' }),
  157 |   ).toBeInViewport();
  158 | });
  159 | 
  160 | test('home supports keyboard access to the main content', async ({ page }) => {
  161 |   await page.goto('/');
  162 |   await page.locator('.skip-link').waitFor({ state: 'attached' });
  163 |   await page.keyboard.press('Tab');
  164 |   await expect(
  165 |     page.getByRole('link', { name: 'ข้ามไปเนื้อหาหลัก' }),
  166 |   ).toBeFocused();
  167 |   await page.keyboard.press('Enter');
  168 |   await expect(page.locator('#landing-main')).toBeFocused();
  169 | });
  170 | 
  171 | test('the header logo keeps visible keyboard focus and its home destination', async ({
  172 |   page,
  173 | }) => {
  174 |   await page.goto('/');
  175 |   const headerLogo = page
  176 |     .getByRole('banner')
  177 |     .getByRole('link', { name: 'VELO POS หน้าแรก' });
  178 |   await page.locator('.skip-link').waitFor({ state: 'attached' });
  179 |   await page.keyboard.press('Tab');
  180 |   await page.keyboard.press('Tab');
  181 |   await expect(headerLogo).toBeFocused();
  182 |   await expect(headerLogo).toHaveCSS('outline-style', 'solid');
  183 |   await page.keyboard.press('Enter');
  184 |   await expect(page).toHaveURL(/\/$/);
  185 | });
  186 | 
  187 | test('the footer language selector switches the page to English', async ({
  188 |   page,
  189 | }) => {
  190 |   await page.goto('/');
  191 |   await page
  192 |     .getByRole('contentinfo')
  193 |     .getByRole('combobox', { name: 'ภาษา' })
  194 |     .selectOption('en');
  195 |   await expect(page.getByRole('heading', { level: 1 })).toHaveText(
  196 |     'Find restaurants in your community',
  197 |   );
  198 |   await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  199 | });
  200 | 
```