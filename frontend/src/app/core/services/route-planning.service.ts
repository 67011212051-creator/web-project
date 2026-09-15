import { Injectable, signal } from '@angular/core';
import { RiderRoute, RouteCostSummary } from '../models/rider-route.model';

export type RecalculateTarget = 'distance' | 'time' | 'profit';

const BASE_ROUTES: RiderRoute[] = [
  {
    riderId: 1, color: '#e74c3c', distanceKm: 4.8, orderCount: 3, boxCount: 5,
    note: 'ไม่เกิน 3 ออเดอร์',
    markerPos: { x: 22, y: 22 },
    path: [{ x: 50, y: 55 }, { x: 22, y: 22 }]
  },
  {
    riderId: 2, color: '#1e9e5a', distanceKm: 3.9, orderCount: 2, boxCount: 3,
    note: 'ไม่เกิน 3 ออเดอร์',
    markerPos: { x: 45, y: 82 },
    path: [{ x: 50, y: 55 }, { x: 45, y: 82 }]
  },
  {
    riderId: 3, color: '#2e6ff2', distanceKm: 2.6, orderCount: 1, boxCount: 1,
    note: 'ไม่เกิน 3 ออเดอร์',
    markerPos: { x: 82, y: 28 },
    path: [{ x: 50, y: 55 }, { x: 82, y: 28 }]
  }
];

const BASE_SUMMARY: RouteCostSummary = {
  revenue: 585,
  foodCost: 360,
  fuelCost: 22.6,
  riderCost: 45,
  netProfit: 157.4,
  totalMinutes: 47,
  totalDistanceKm: 11.3,
  finishTimeText: '12:17 น.',
  onTime: true,
  orderCount: 6,
  riderCount: 3
};

@Injectable({ providedIn: 'root' })
export class RoutePlanningService {
  readonly hasCalculated = signal(false);
  readonly routes = signal<RiderRoute[]>(BASE_ROUTES);
  readonly summary = signal<RouteCostSummary>(BASE_SUMMARY);
  readonly lastTarget = signal<RecalculateTarget>('distance');

  calculate() {
    this.routes.set(BASE_ROUTES);
    this.summary.set(BASE_SUMMARY);
    this.hasCalculated.set(true);
  }

  recalculate(target: RecalculateTarget, allowReassign: boolean) {
    const base = BASE_SUMMARY;
    let summary: RouteCostSummary = { ...base };

    if (target === 'distance') {
      summary = { ...base, totalDistanceKm: 10.1, totalMinutes: 43, netProfit: 159.9, finishTimeText: '12:13 น.' };
    } else if (target === 'time') {
      summary = { ...base, totalDistanceKm: 12.4, totalMinutes: 39, netProfit: 152.6, finishTimeText: '12:09 น.' };
    } else {
      summary = { ...base, totalDistanceKm: 13.2, totalMinutes: 51, netProfit: 171.3, finishTimeText: '12:21 น.' };
    }

    let routes = BASE_ROUTES;
    if (allowReassign && target === 'profit') {
      routes = BASE_ROUTES.map(r => (r.riderId === 3 ? { ...r, orderCount: 2, boxCount: 3 } : r));
    }

    this.lastTarget.set(target);
    this.routes.set(routes);
    this.summary.set(summary);
    this.hasCalculated.set(true);
  }
}
