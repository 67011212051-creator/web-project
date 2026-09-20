# LunchFlow Admin

Angular (standalone components, Angular 17) scaffold for the LunchFlow "ส่งด่วนมื้อเที่ยง"
rider dispatch system, based on the provided screenshots/brief.

โฟลเดอร์ตามที่ขอ (ไม่มี services/ และ models/ — ข้อมูลเป็น mock อยู่ในแต่ละ component โดยตรง):

```
src/app/
├── app.component.*         # shell: sidebar + <router-outlet>
├── app.routes.ts
├── app.config.ts
├── pages/
│   ├── customers/          # จัดการข้อมูลลูกค้า
│   ├── orders/              # จัดการออเดอร์
│   ├── route-planning/      # จัดเส้นทางและแบ่งงานไรเดอร์
│   └── rider-job/           # หน้าจอไรเดอร์ (มือถือ): ดูใบงาน -> รายละเอียด -> นำทาง
└── components/
    ├── sidebar/
    ├── customer-modal/       # เพิ่ม/แก้ไขลูกค้า
    ├── order-modal/          # เพิ่มออเดอร์
    ├── simulate-order-modal/ # จำลองออเดอร์
    ├── recalculate-modal/    # คำนวณเส้นทางใหม่
    └── precheck-modal/       # ตรวจสอบก่อนคำนวณเส้นทาง
```

## รันโปรเจกต์

```bash
npm install
npm start
```

จากนั้นเปิด http://localhost:4200

- `/customers` จัดการลูกค้า
- `/orders` จัดการออเดอร์
- `/route-planning` จัดเส้นทาง + คำนวณใหม่/ตรวจสอบก่อนคำนวณ
- `/rider` หน้าจอไรเดอร์ (mobile-style, ไม่มี sidebar) — ลองพิมพ์เลขใบงานอะไรก็ได้แล้วกด "ดูใบงาน"

## หมายเหตุ

- แผนที่เป็น placeholder (ลายเส้นทแยง + หมุด CSS) ยังไม่ได้ต่อ Google Maps API จริง —
  จุดที่ต้องต่อคือ `map-area` ใน `customers`, `route-planning` และ `map-mock` ใน `rider-job`
- ข้อมูลลูกค้า/ออเดอร์/เส้นทางเป็น mock data ฝังในแต่ละ component (ไม่มี services/models ตามที่ขอ)
  ถ้าจะต่อ backend จริง แนะนำแยกกลับเป็น services + models ภายหลัง
