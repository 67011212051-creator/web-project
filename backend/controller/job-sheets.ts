import express from "express";
import { dbconnect } from '../dbconnect'

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


    if (error) {
        const errorMessage = error?.message || "Unknown error";
        res.status(500).json({ error: errorMessage });
        return;
    }   
})

// export interface JobStop {
//   order_id: number;
//   stop_seq: number;
//   distance_km: number;
//   travel_time_min: number;
//   delivery_time_min: number;
//   latitude: number;
//   longitude: number;
//   order?: Order;
// }

// export interface JobSheet {
//   job_code: string;
//   rider_id: number;
//   rider?: Rider;
//   distance_km: number;
//   duration_min: number;
//   rider_pay: number;
//   total_boxes: number;
//   total_orders: number;
//   sales: number;
//   food_cost: number;
//   net_profit: number;
//   stops: JobStop[];
// }

// ## Table `job_stops`

// ### Columns

// | Name | Type | Constraints |
// |------|------|-------------|
// | `job_id` | `int4` | Primary |
// | `order_id` | `int4` |  Unique |
// | `stop_seq` | `int2` | Primary |
// | `distance_km` | `numeric` |  |


// ## Table `job_sheets`

// ### Columns

// | Name | Type | Constraints |
// |------|------|-------------|
// | `job_id` | `int4` | Primary |
// | `job_code` | `varchar` |  Unique |
// | `rider_id` | `int4` |  |
// | `distance_km` | `numeric` |  |
// | `duration_min` | `int4` |  |
// | `rider_pay` | `numeric` |  |




router.post("/dispatch", async (req, res) => {
  const { jobSheets } = req.body;

  if (!Array.isArray(jobSheets) || jobSheets.length === 0) {
    res.status(400).json({ error: "Invalid job sheets data" });
    return;
  }

  const jobSheetRows = jobSheets.map((jobSheet: any) => ({
    job_code: jobSheet.job_code,
    rider_id: jobSheet.rider_id,
    distance_km: jobSheet.distance_km,
    duration_min: jobSheet.duration_min,
    rider_pay: jobSheet.rider_pay,
  }));

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