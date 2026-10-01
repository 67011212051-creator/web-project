import express from "express";
import { dbconnect } from './../dbconnect'

export const router = express.Router();

router.get("/", async (req, res) => {
  const { data, error } = await dbconnect.from('orders').select('*')
  
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
  
    res.json(data)
});

router.delete("/delete/:id", async (req, res) => {
  const orderId = Number(req.params.id);

  if (!Number.isInteger(orderId) || orderId <= 0) {
    res.status(400).json({ error: "Invalid order ID" });
    return;
  }

  const { data, error } = await dbconnect
    .from("job_stops")
    .delete()
    .eq("order_id", orderId)
    .select("order_id");

  const { data: orderData, error: orderError } = await dbconnect
    .from("orders")
    .delete()
    .eq("order_id", orderId)
    .select("order_id");

  if (error || orderError) {
    const errorMessage = error?.message || orderError?.message || "Unknown error";
    res.status(500).json({ error: errorMessage });
    return;
  }
})