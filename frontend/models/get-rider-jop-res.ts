export interface getRiderJobStop {
  stop_seq: number;
  order_id: number;
  distance_km: number;
  qty: number;
  customer_name: string;
  phone: string;
  latitude: number;
  longitude: number;
}

export interface getRiderJobResponse {
  job_code: string;
  distance_km: number;
  duration_min: number;
  rider_pay: number;
  total_boxes: number;
  total_orders: number;
  stops: getRiderJobStop[];
}