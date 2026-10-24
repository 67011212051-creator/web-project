import express from "express";
import { execute, queryRows } from "../dbconnect";

export const router = express.Router();

router.delete("/delete/:id", async (req, res) => {
  const customerId = Number(req.params.id);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    res.status(400).json({ error: "Invalid customer ID" });
    return;
  }

  const orders = await queryRows(
    "SELECT order_id FROM orders WHERE customer_id = ? LIMIT 1",
    [customerId],
  );

  if (orders?.length) {
    res.status(409).json({ error: "Customer has related orders" });
    return;
  }

  const result = await execute(
    "DELETE FROM customers WHERE customer_id = ?",
    [customerId],
  );
  res.json(result.affectedRows > 0 ? [{ customer_id: customerId }] : []);
});

router.post("/add", async (req, res) => {
  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    res.status(400).json({ error: "Request body must be a JSON object" });
    return;
  }

  const { name, phone, latitude, longitude } = req.body;

  const result = await execute(
    "INSERT INTO customers (name, phone, latitude, longitude) VALUES (?, ?, ?, ?)",
    [name, phone, latitude, longitude],
  );
  const data = await queryRows(
    "SELECT * FROM customers WHERE customer_id = ?",
    [result.insertId],
  );
  res.status(201).json(data);
});

router.put("/update/:id", async (req, res) => {
  const customerId = Number(req.params.id);

  if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
    res.status(400).json({ error: "Request body must be a JSON object" });
    return;
  }

  const { name, phone, latitude, longitude } = req.body;

  await execute(
    "UPDATE customers SET name = ?, phone = ?, latitude = ?, longitude = ? WHERE customer_id = ?",
    [name, phone, latitude, longitude, customerId],
  );
  const data = await queryRows("SELECT * FROM customers WHERE customer_id = ?", [
    customerId,
  ]);
  res.json(data);
});