import express from 'express'
import cors from 'cors' // 1. import cors
import { dbconnect } from './dbconnect'

const app = express()

// 2. เปิดใช้งาน CORS (แนะนำระบุ origin ที่อนุญาต หรือใช้ cors() เพื่อปลดล็อกทุก domain ในช่วง dev)
app.use(cors({
  origin: 'http://localhost:4200'
}))

const getAllRows = (table: string) => async (_req: express.Request, res: express.Response) => {
  const { data, error } = await dbconnect.from(table).select('*')

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json(data)
}

app.get('/riders', getAllRows('riders'))
app.get('/customers', getAllRows('customers'))
app.get('/rounds', getAllRows('rounds'))
app.get('/orders', getAllRows('orders'))
app.get('/job_sheets', getAllRows('job_sheets'))
app.get('/job_stops', getAllRows('job_stops'))

// เปลี่ยนจาก app.use เป็น app.get เพื่อไม่ให้ไปทับ HTTP method อื่นๆ
app.get("/", (_req, res) => {
  res.send("Hello World!!!");
});

app.listen(3000, () => {
  console.log('Backend running on http://localhost:3000')
})