import express from 'express'
import { dbconnect } from './dbconnect'

const app = express()

const getAllRows = (table: string) => async (_req: express.Request, res: express.Response) => {
  const { data, error } = await dbconnect.from(table).select('*')

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json(data)
}

app.get('/customers', getAllRows('customers'))
app.get('/stores', getAllRows('stores'))
app.get('/products', getAllRows('products'))
app.get('/orders', getAllRows('orders'))
app.get('/order_items', getAllRows('order_items'))
app.get('/riders', getAllRows('riders'))
app.get('/delivery_jobs', getAllRows('delivery_jobs'))
app.get('/delivery_stops', getAllRows('delivery_stops'))

app.use("/", (req, res) => {
  res.send("Hello World!!!");
});

app.listen(3000, () => {
  console.log('Backend running on http://localhost:3000')
})