export interface Customer {
  customer_id: number;
  name: string;
  phone: string;
  latitude: number;
  longitude: number;
}

export interface Order {
  order_id: number;
  customer_id: number;
  delivery_fee: number;
  qty: number;
  date?: string;
  customer?: Customer;
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
  order_ids?: number[];
  stops: JobStop[];
}

export interface RouteSummary {
  totalOrders: number;
  totalRiders: number;
  totalBoxes: number;
  totalDistanceKm: number;
  maxDurationMin: number;
  sales: number;
  foodCost: number;
  deliveryDistanceCost: number;
  riderBaseCost: number;
  netProfit: number;
  estimatedFinishTime: string;
  onTime?: boolean;
}

export interface RouteCalculationResponse {
  jobSheets: JobSheet[];
  summary: RouteSummary;
  ordersSignature: string;
  algorithmIndex?: number;
  algorithmName?: string;
  excludedOutOfRangeCount?: number;
  invalidCoordCount?: number;
  distanceSource?: 'osrm' | 'fallback' | 'none';
}