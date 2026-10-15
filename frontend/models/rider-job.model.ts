export interface JobStop {
  stop_seq: number;
  order_id: number;
  distance_km: number;
  qty: number;
  customer_name: string;
  phone: string;
  latitude: number;
  longitude: number;
}

export interface JobSheet {
  job_code: string;
  distance_km: number;
  duration_min: number;
  rider_pay: number;
  total_boxes: number;
  total_orders: number;
  stops: JobStop[];
}