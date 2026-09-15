export interface RiderStop {
  seq: number;
  customerName: string;
  boxCount: number;
}

export interface RiderRoute {
  riderId: number;
  color: string;
  distanceKm: number;
  orderCount: number;
  boxCount: number;
  note: string;
  path: { x: number; y: number }[];
  markerPos: { x: number; y: number };
}

export interface RouteCostSummary {
  revenue: number;
  foodCost: number;
  fuelCost: number;
  riderCost: number;
  netProfit: number;
  totalMinutes: number;
  totalDistanceKm: number;
  finishTimeText: string;
  onTime: boolean;
  orderCount: number;
  riderCount: number;
}
