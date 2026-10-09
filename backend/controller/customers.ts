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

router.post("/add", async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    res.status(400).json({ error: "Request body must be a JSON object" });
    return;
  }

  const { name, phone, latitude, longitude } = req.body;

  const { data, error } = await dbconnect.from("customers")
    .insert([
      {
        name,
        phone,
        latitude,
        longitude
      }
    ])
    .select();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
});

router.put("/update/:id", async (req, res) => {
  const customerId = Number(req.params.id);

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    res.status(400).json({ error: "Request body must be a JSON object" });
    return;
  }

  const { name, phone, latitude, longitude } = req.body;

  const { data, error } = await dbconnect.from("customers")
    .update({
      name,
      phone,
      latitude,
      longitude
    })
    .eq("customer_id", customerId)
    .select();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});