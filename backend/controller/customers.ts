import express from "express";
import { dbconnect } from './../dbconnect'

export const router = express.Router();

router.get("/", async (req, res) => {
  const { data, error } = await dbconnect.from('customers').select('*')
  
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
  
    res.json(data)
});

router.delete("/delete/:id", async (req, res) => {
  const customerId = Number(req.params.id);
  
  const { data, error } = await dbconnect.from("customers")
    .delete()
    .eq("customer_id", customerId)
    .select("customer_id");
  
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
  
    res.json(data)
});