import express from "express";
import { dbconnect } from './../dbconnect'

export const router = express.Router();

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

  res.json({ job_stops: data, orders: orderData });
})

router.delete("/deleteByCustomerId/:customerId", async (req, res) => {
  const customerId = Number(req.params.customerId);

  if (!Number.isInteger(customerId) || customerId <= 0) {
    res.status(400).json({ error: "Invalid customer ID" });
    return;
  }

  const { data: customerOrderIds, error: customerOrderIdsError } = await dbconnect
    .from("orders")
    .select("order_id")
    .eq("customer_id", customerId);

  if (customerOrderIdsError) {
    res.status(500).json({ error: customerOrderIdsError.message });
    return;
  }

  const orderIds = (customerOrderIds ?? []).map(({ order_id }) => order_id);

  if (orderIds.length === 0) {
    res.json({ job_stops: [], orders: [] });
    return;
  }

  const { data, error } = await dbconnect
    .from("job_stops")
    .delete()
    .in("order_id", orderIds)
    .select("order_id");

  const { data: orderData, error: orderError } = await dbconnect
    .from("orders")
    .delete()
    .eq("customer_id", customerId)
    .select("order_id");

  if (error || orderError) {
    const errorMessage = error?.message || orderError?.message || "Unknown error";
    res.status(500).json({ error: errorMessage });
    return;
  }

  res.json({ job_stops: data, orders: orderData });
});

router.post("/add", async (req, res) => {
  const { customer_id,  qty } = req.body;
  const { data, error } = await dbconnect.from("orders")
    .insert([
      {
        customer_id,
        qty
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
  const orderId = Number(req.params.id);
  const { customer_id,  qty } = req.body;

  const { data, error } = await dbconnect.from("orders")
    .update({
      customer_id,
      qty
    })
    .eq("order_id", orderId)
    .select();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

router.post("/simulate", async (req, res) => {
  const count = Math.min(Math.max(Math.floor(Number(req.body?.count)) || 25, 1), 50);
  const clearOld = req.body?.clearOld === true;

  const { data: customers, error: customersError } = await dbconnect
    .from("customers")
    .select("customer_id");

  if (customersError) {
    res.status(500).json({ error: customersError.message });
    return;
  }

  if (!customers || customers.length === 0) {
    res.status(400).json({ error: "ไม่มีลูกค้าในระบบสำหรับจำลองออเดอร์" });
    return;
  }

  let eligibleCustomers = customers;
  let existingOrderIds: number[] = [];

  if (clearOld) {
    const { data: existingOrders, error: existingOrdersError } = await dbconnect
      .from("orders")
      .select("order_id");

    if (existingOrdersError) {
      res.status(500).json({ error: existingOrdersError.message });
      return;
    }

    existingOrderIds = (existingOrders ?? []).map(({ order_id }) => order_id);
  } else {
    const { data: existingOrders, error: existingOrdersError } = await dbconnect
      .from("orders")
      .select("customer_id");

    if (existingOrdersError) {
      res.status(500).json({ error: existingOrdersError.message });
      return;
    }

    const usedCustomerIds = new Set((existingOrders ?? []).map(({ customer_id }) => customer_id));
    eligibleCustomers = customers.filter(({ customer_id }) => !usedCustomerIds.has(customer_id));
  }

  if (eligibleCustomers.length === 0) {
    res.status(400).json({ error: "ไม่มีลูกค้าที่ว่างสำหรับจำลองออเดอร์" });
    return;
  }

  if (clearOld && existingOrderIds.length > 0) {
    const { error: stopsError } = await dbconnect
      .from("job_stops")
      .delete()
      .in("order_id", existingOrderIds);

    if (stopsError) {
      res.status(500).json({ error: stopsError.message });
      return;
    }

    const { error: deleteOrdersError } = await dbconnect
      .from("orders")
      .delete()
      .in("order_id", existingOrderIds);

    if (deleteOrdersError) {
      res.status(500).json({ error: deleteOrdersError.message });
      return;
    }
  }

  const shuffledCustomers = [...eligibleCustomers];
  for (let i = shuffledCustomers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const customer = shuffledCustomers[i]!;
    shuffledCustomers[i] = shuffledCustomers[j]!;
    shuffledCustomers[j] = customer;
  }

  const rows = shuffledCustomers.slice(0, count).map(({ customer_id }) => ({
    customer_id,
    qty: Math.floor(Math.random() * 3) + 1,
    delivery_fee: 0,
  }));

  const { data, error } = await dbconnect.from("orders").insert(rows).select();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
});
