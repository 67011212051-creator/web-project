import { getCustomersResponse } from './get-customers-res';
import { getOrdersResponse } from './get-orders-res';

export interface Order extends Omit<getOrdersResponse, 'round_id'> {
  round_id?: number;
  date?: string;
  customer?: getCustomersResponse;
}

export interface Rider {
  rider_id: number;
  rider_code: string;
  route_color: string;
  max_orders?: number;
}

export interface JobStop {
  order_id: number;
  stop_seq: number;
  distance_km: number;
  travel_time_min: number;
  delivery_time_min: number;
  latitude: number;
  longitude: number;
  order?: Order;
}

export interface JobSheet {
  job_code: string;
  rider_id: number;
  rider?: Rider;
  distance_km: number;
  duration_min: number;
  rider_pay: number;
  total_boxes: number;
  total_orders: number;
  sales: number;
  food_cost: number;
  net_profit: number;
  stops: JobStop[];
}