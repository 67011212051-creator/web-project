import express from 'express'
import cors from 'cors' // 1. import cors
import { router as index } from "./controller/index";
import { router as orders } from "./controller/orders";
import { router as customers } from "./controller/customers";

export const app = express();

// 2. เปิดใช้งาน CORS (แนะนำระบุ origin ที่อนุญาต หรือใช้ cors() เพื่อปลดล็อกทุก domain ในช่วง dev)
app.use(cors({
  origin: 'http://localhost:4200'
}))

app.use("/", index);
app.use("/orders", orders);
app.use("/customers", customers);

// เปลี่ยนจาก app.use เป็น app.get เพื่อไม่ให้ไปทับ HTTP method อื่นๆ
app.get("/", (_req, res) => {
  res.send("Hello World!!!");
});

app.listen(3000, () => {
  console.log('Backend running on http://localhost:3000')
})