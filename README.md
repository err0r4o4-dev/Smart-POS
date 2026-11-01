# VELOPOS

โปรเจกต์ตัวอย่างหน้า Shopping Cart ด้วย React + Vite

## วิธีเปิดใช้งาน

1. เปิดโฟลเดอร์นี้ด้วย Visual Studio Code
2. เปิด Terminal ใน VS Code
3. ติดตั้งแพ็กเกจ (ทำครั้งแรกครั้งเดียว)

   ```powershell
   npm.cmd install
   ```

4. เริ่มรันเว็บไซต์

   ```powershell
   npm.cmd run dev
   ```

5. เปิด URL ที่แสดงใน Terminal เช่น `http://localhost:5173/`

> หมายเหตุ: เป็น UI Prototype ใช้ข้อมูลสินค้าและรูปภาพตัวอย่าง การยืนยันคำสั่งซื้อยังไม่เชื่อมต่อฐานข้อมูลหรือระบบชำระเงินจริง

## โครงสร้างไฟล์

- `src/Cart.jsx` — หน้าตะกร้าสินค้าและการทำงานของปุ่ม
- `src/Cart.css` — รูปแบบหน้าตา
- `src/App.jsx` — จุดเริ่มต้นของหน้าเว็บ
- `src/main.jsx` — จุดเริ่มต้น React
