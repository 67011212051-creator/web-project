import express from "express";
import { dbconnect } from '../dbconnect'

export const router = express.Router();

router.get("/code/:jobCode", async (req, res) => {
  const jobCode = String(req.params.jobCode ?? "").trim().toUpperCase();

  if (!/^[A-Z0-9-]{3,30}$/.test(jobCode)) {
    res.status(400).json({ error: "Invalid job code" });
    return;
  }

  const { data: sheet, error: sheetError } = await dbconnect
    .from("job_sheets")
    .select("job_id, job_code, distance_km, duration_min, rider_pay")
    .eq("job_code", jobCode)
    .maybeSingle();

  if (sheetError) {
    res.status(500).json({ error: sheetError.message });
    return;
  }

  if (!sheet) {
    res.status(404).json({ error: "Job sheet not found" });
    return;
  }

  const { data: stops, error: stopsError } = await dbconnect
    .from("job_stops")
    .select("order_id, stop_seq, distance_km")
    .eq("job_id", sheet.job_id)
    .order("stop_seq", { ascending: true });

  if (stopsError) {
    res.status(500).json({ error: stopsError.message });
    return;
  }

  const jobStops = stops ?? [];
  const orderIds = jobStops.map((stop) => stop.order_id);

  let orders: { order_id: number; customer_id: number; qty: number }[] = [];
  let customers: {
    customer_id: number;
    name: string;
    phone: string;
    latitude: number;
    longitude: number;
  }[] = [];

  if (orderIds.length > 0) {
    const { data: orderRows, error: ordersError } = await dbconnect
      .from("orders")
      .select("order_id, customer_id, qty")
      .in("order_id", orderIds);

    if (ordersError) {
      res.status(500).json({ error: ordersError.message });
      return;
    }
    orders = orderRows ?? [];

    const customerIds = [...new Set(orders.map((order) => order.customer_id))];

    if (customerIds.length > 0) {
      const { data: customerRows, error: customersError } = await dbconnect
        .from("customers")
        .select("customer_id, name, phone, latitude, longitude")
        .in("customer_id", customerIds);

      if (customersError) {
        res.status(500).json({ error: customersError.message });
        return;
      }
      customers = customerRows ?? [];
    }
  }

  const orderById = new Map(orders.map((order) => [order.order_id, order]));
  const customerById = new Map(customers.map((customer) => [customer.customer_id, customer]));

  const resultStops = jobStops.map((stop) => {
    const order = orderById.get(stop.order_id);
    const customer = order ? customerById.get(order.customer_id) : undefined;

    return {
      stop_seq: stop.stop_seq,
      order_id: stop.order_id,
      distance_km: Number(stop.distance_km),
      qty: order?.qty ?? 0,
      customer_name: customer?.name ?? "-",
      phone: customer?.phone ?? "-",
      latitude: Number(customer?.latitude),
      longitude: Number(customer?.longitude),
    };
  });

  res.json({
    job_code: sheet.job_code,
    distance_km: Number(sheet.distance_km),
    duration_min: Number(sheet.duration_min),
    rider_pay: Number(sheet.rider_pay),
    total_boxes: resultStops.reduce((sum, stop) => sum + stop.qty, 0),
    total_orders: resultStops.length,
    stops: resultStops,
  });
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


    if (error) {
        const errorMessage = error?.message || "Unknown error";
        res.status(500).json({ error: errorMessage });
        return;
    }   
})

router.post("/dispatch", async (req, res) => {
  const { jobSheets, riders } = req.body;

  if (!Array.isArray(jobSheets) || jobSheets.length === 0) {
    res.status(400).json({ error: "Invalid job sheets data" });
    return;
  }

  const riderRows = riders.map((rider: any) => ({
    rider_code: rider.rider_code,
    route_color: rider.route_color,
    max_orders: rider.max_orders ?? 3,
  }));

  const { data: riderData, error: riderError } = await dbconnect
    .from("riders")
    .insert(riderRows)
    .select("rider_id, rider_code");

  if (riderError) {
    res.status(500).json({ error: riderError.message || "Unknown error" });
    return;
  }

  const riderIdsByCode = new Map(
    (riderData || []).map((rider) => [rider.rider_code, rider.rider_id])
  );
  const jobSheetRows = jobSheets.map((jobSheet: any) => ({
    job_code: jobSheet.job_code,
    rider_id: riderIdsByCode.get(jobSheet.rider?.rider_code),
    distance_km: jobSheet.distance_km,
    duration_min: jobSheet.duration_min,
    rider_pay: jobSheet.rider_pay,
  }));

  if (jobSheetRows.some((jobSheet) => !jobSheet.rider_id)) {
    res.status(400).json({ error: "A job sheet references an unknown rider" });
    return;
  }

  const { data: jobSheetData, error: jobSheetError } = await dbconnect
    .from("job_sheets")
    .insert(jobSheetRows)
    .select("job_id, job_code");

  if (jobSheetError) {
    res.status(500).json({ error: jobSheetError.message || "Unknown error" });
    return;
  }

  const jobIdsByCode = new Map(
    (jobSheetData || []).map((jobSheet) => [jobSheet.job_code, jobSheet.job_id])
  );
  const rows = jobSheets.flatMap((jobSheet: any) =>
    (jobSheet.stops || []).map((stop: any) => ({
      job_id: jobIdsByCode.get(jobSheet.job_code),
      order_id: stop.order_id,
      stop_seq: stop.stop_seq,
      distance_km: stop.distance_km,
    }))
  );

  const { data, error } = await dbconnect
    .from("job_stops")
    .insert(rows)
    .select();

  if (error) {
    const { error: cleanupError } = await dbconnect
      .from("job_sheets")
      .delete()
      .in("job_id", (jobSheetData || []).map((jobSheet) => jobSheet.job_id));
    res.status(500).json({
      error: cleanupError
        ? `${error.message}; additionally failed to remove newly-created job sheets: ${cleanupError.message}`
        : error.message || "Unknown error",
    });
    return;
  }

  res.json({ message: "Job sheets dispatched successfully", data: { jobStops: data, jobSheets: jobSheetData } });
});