import {
  Component, OnInit, AfterViewInit, OnDestroy, ElementRef,
  inject, viewChild
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { lastValueFrom } from 'rxjs';
import * as L from 'leaflet';

// พิกัดร้านค้าศูนย์กลาง (ตรงกับหน้า Customers)
const MSU_CENTER: L.LatLngTuple = [16.2466557, 103.2517639];
const API_BASE_URL = 'http://localhost:3000';
const ROUTE_CACHE_KEY = 'route-planning-cache';

const CONFIG = {
  SPEED_KMH: 30,
  TIME_PER_STOP_MIN: 3,
  MAX_ORDERS_PER_ROUTE: 3,
  PRICE_PER_BOX: 65,
  FOOD_COST_PER_BOX: 40,
  RIDER_BASE_FEE: 15,
  FUEL_RATE_PER_KM_BOX: 2,
  MAX_DELIVERY_MIN: 60
};

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
  date: string;
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
  order_ids?: number[]; // รองรับการเก็บรายการ Order ID
  stops: JobStop[];
}

@Component({
  selector: 'app-route-planning',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './route-planning.component.html',
  styleUrls: ['./route-planning.component.css']
})
export class RoutePlanningComponent implements OnInit, AfterViewInit, OnDestroy {
  private http = inject(HttpClient);

  mapEl = viewChild.required<ElementRef<HTMLDivElement>>('mapEl');
  private map?: L.Map;
  private routeLayerGroup = L.layerGroup();
  private resizeObserver?: ResizeObserver;

  isLoading = false;
  isSaving = false;
  isCalculated = false;
  isDispatched = false;

  jobSheets: JobSheet[] = [];

  summary = {
    totalOrders: 0,
    totalRiders: 0,
    totalBoxes: 0,
    totalDistanceKm: 0,
    maxDurationMin: 0,
    sales: 0,
    foodCost: 0,
    deliveryDistanceCost: 0,
    riderBaseCost: 0,
    netProfit: 0,
    estimatedFinishTime: '11:30 น.'
  };

  ngOnInit(): void { }

  ngAfterViewInit(): void {
    this.initMap();
    void this.initRouteData();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  // --- Helper สำหรับดึงรหัสออเดอร์มาแสดงในหน้า HTML ---
  getOrderIds(job: JobSheet): string {
    if (job.order_ids && job.order_ids.length > 0) {
      return job.order_ids.join(', ');
    }
    if (job.stops && job.stops.length > 0) {
      return job.stops.map(s => s.order_id).join(', ');
    }
    return '';
  }

  // --- 1. จัดการแผนที่ Leaflet ---
  private initMap(): void {
    this.map = L.map(this.mapEl().nativeElement).setView(MSU_CENTER, 14);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(this.map);

    // รัศมีให้บริการ 3 กม.
    L.circle(MSU_CENTER, {
      radius: 3000,
      color: '#d88f16',
      fillColor: '#f4a623',
      fillOpacity: 0.08,
    }).addTo(this.map);

    const shopIcon = L.icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    L.marker(MSU_CENTER, { icon: shopIcon })
      .bindPopup('<b>📍 ร้านค้า (จุดเริ่มต้นจัดสายส่ง)</b>')
      .addTo(this.map);

    this.routeLayerGroup.addTo(this.map);

    this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
    this.resizeObserver.observe(this.mapEl().nativeElement);
  }

  // --- 2. Action Handlers ---
  async onCalculateRoutes(): Promise<void> {
    await this.executeRouting();
  }

  async onRecalculateRoutes(): Promise<void> {
    await this.executeRouting();
  }

  async onConfirmDispatch(): Promise<void> {
    if (this.jobSheets.length === 0) {
      alert('กรุณาคำนวณเส้นทางก่อนกดยืนยันส่งงาน');
      return;
    }
    
    this.isSaving = true;

    try {
      const payload = {
        riders: this.getAssignedRiders(),
        jobSheets: this.jobSheets.map(job => ({
          job_code: job.job_code,
          rider_id: job.rider_id,
          distance_km: job.distance_km,
          duration_min: job.duration_min,
          rider_pay: job.rider_pay,
          total_boxes: job.total_boxes,
          total_orders: job.total_orders,
          sales: job.sales,
          food_cost: job.food_cost,
          net_profit: job.net_profit,
          rider: job.rider ? {
            rider_id: job.rider.rider_id,
            rider_code: job.rider.rider_code,
            route_color: job.rider.route_color,
            max_orders: job.rider.max_orders ?? 3
          } : undefined,
          stops: job.stops.map(stop => ({
            order_id: stop.order_id,
            stop_seq: stop.stop_seq,
            distance_km: stop.distance_km,
            travel_time_min: stop.travel_time_min,
            delivery_time_min: stop.delivery_time_min
          }))
        }))
      };

      await lastValueFrom(
        this.http.post(`${API_BASE_URL}/job-sheets/dispatch`, payload)
      );

      this.isDispatched = true;
      this.saveCachedRoutes();
      alert('บันทึกข้อมูลไรเดอร์และใบงานเรียบร้อยแล้ว!');
    } catch (error: any) {
      console.error('Error dispatching jobs:', error);
      const errorMsg = error?.error?.error || error?.message || 'เกิดข้อผิดพลาดในการบันทึกใบงานผ่าน API';
      alert(`ไม่สามารถบันทึกข้อมูลได้: ${errorMsg}`);
    } finally {
      this.isSaving = false;
    }
  }

  // --- 3. Routing Engine (Sweep Algorithm) ---
  private async executeRouting(preloadedOrders?: Order[]): Promise<void> {
    if (this.isLoading) return;

    this.isLoading = true;

    try {
      const orders = preloadedOrders ?? await this.loadOrders();
      const validOrders = orders.filter(
        o => o.customer && Number.isFinite(o.customer.latitude) && Number.isFinite(o.customer.longitude) &&
             o.customer.latitude !== 0 && o.customer.longitude !== 0
      );

      if (validOrders.length === 0) {
        this.jobSheets = [];
        this.calculateSummary();
        this.routeLayerGroup.clearLayers();
        this.isCalculated = false;
        this.isDispatched = false;
        sessionStorage.removeItem(ROUTE_CACHE_KEY);
        alert('ไม่พบข้อมูลออเดอร์ที่มีพิกัดถูกต้องสำหรับการจัดสายส่ง');
        return;
      }

      this.jobSheets = this.computeSweepRoutes(validOrders);
      this.calculateSummary();

      this.isCalculated = true;
      this.isDispatched = false;

      this.saveCachedRoutes(this.getOrdersSignature(validOrders));

      await this.renderRoutesOnMap();
    } catch (error) {
      console.error('Route calculation error:', error);
      alert('เกิดข้อผิดพลาดในการดึงข้อมูลออเดอร์หรือคำนวณเส้นทาง');
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Sweep Algorithm: จัดกลุ่มออเดอร์ตามมุมทิศทางรอบร้าน (Polar Angle) เพื่อแยกโซนอย่างเป็นระเบียบ
   */
  private computeSweepRoutes(orders: Order[]): JobSheet[] {
    const unassigned = orders.map(o => ({ ...o }));

    const ordersWithAngle = unassigned.map(o => {
      const lat = o.customer!.latitude;
      const lon = o.customer!.longitude;
      const angle = Math.atan2(lat - MSU_CENTER[0], lon - MSU_CENTER[1]);
      return { order: o, angle };
    });

    ordersWithAngle.sort((a, b) => a.angle - b.angle);
    const sortedOrders = ordersWithAngle.map(item => item.order);

    const jobSheets: JobSheet[] = [];
    let riderIndex = 0;

    while (sortedOrders.length > 0) {
      let currentLoc: [number, number] = [MSU_CENTER[0], MSU_CENTER[1]];
      let currentDistance = 0;
      let currentTime = 0;
      let currentBoxes = 0;
      const stops: JobStop[] = [];

      while (stops.length < CONFIG.MAX_ORDERS_PER_ROUTE && sortedOrders.length > 0) {
        let nearestIdx = -1;
        let shortestDist = Infinity;
        let travelTime = 0;

        for (let i = 0; i < sortedOrders.length; i++) {
          const candidate = sortedOrders[i];
          const dist = this.haversine(
            currentLoc[0], currentLoc[1],
            candidate.customer!.latitude, candidate.customer!.longitude
          );
          const tTime = (dist / CONFIG.SPEED_KMH) * 60;

          if (currentTime + tTime + CONFIG.TIME_PER_STOP_MIN <= CONFIG.MAX_DELIVERY_MIN && dist < shortestDist) {
            shortestDist = dist;
            nearestIdx = i;
            travelTime = tTime;
          }
        }

        if (nearestIdx === -1) {
          nearestIdx = 0;
          const candidate = sortedOrders[nearestIdx];
          shortestDist = this.haversine(currentLoc[0], currentLoc[1], candidate.customer!.latitude, candidate.customer!.longitude);
          travelTime = (shortestDist / CONFIG.SPEED_KMH) * 60;
        }

        const [selected] = sortedOrders.splice(nearestIdx, 1);
        const stopSeq = stops.length + 1;

        stops.push({
          order_id: selected.order_id,
          stop_seq: stopSeq,
          distance_km: Math.round(shortestDist * 100) / 100,
          travel_time_min: travelTime,
          delivery_time_min: CONFIG.TIME_PER_STOP_MIN,
          latitude: selected.customer!.latitude,
          longitude: selected.customer!.longitude,
          order: selected
        });

        currentDistance += shortestDist;
        currentTime += travelTime + CONFIG.TIME_PER_STOP_MIN;
        currentBoxes += selected.qty;
        currentLoc = [selected.customer!.latitude, selected.customer!.longitude];
      }

      if (stops.length === 0) break;

      const distinctColor = this.getDistinctRouteColor(riderIndex);
      const generatedRider: Rider = {
        rider_id: riderIndex + 1,
        rider_code: `RD${String(riderIndex + 1).padStart(2, '0')}`,
        route_color: distinctColor,
        max_orders: CONFIG.MAX_ORDERS_PER_ROUTE
      };

      const deliveryCost = CONFIG.RIDER_BASE_FEE + (currentDistance * currentBoxes * CONFIG.FUEL_RATE_PER_KM_BOX);
      const sales = currentBoxes * CONFIG.PRICE_PER_BOX;
      const foodCost = currentBoxes * CONFIG.FOOD_COST_PER_BOX;
      const netProfit = sales - foodCost - deliveryCost;

      const shortTime = Date.now().toString().slice(-6);
      const rand = Math.floor(10 + Math.random() * 90);
      const jobCode = `J-${shortTime}-${rand}-${generatedRider.rider_code}`.slice(0, 20);
      const orderIds = stops.map(s => s.order_id);

      jobSheets.push({
        job_code: jobCode,
        rider_id: generatedRider.rider_id,
        rider: generatedRider,
        distance_km: Math.round(currentDistance * 100) / 100,
        duration_min: Math.round(currentTime),
        rider_pay: Math.round(deliveryCost * 100) / 100,
        total_boxes: currentBoxes,
        total_orders: stops.length,
        sales,
        food_cost: foodCost,
        net_profit: Math.round(netProfit * 100) / 100,
        order_ids: orderIds,
        stops
      });

      riderIndex++;
    }

    return jobSheets;
  }

  // --- 4. วาดเส้นตามถนนจริง OSRM (ขนานเกาะแนวถนน ไม่หลุดเลน) ---
  private async renderRoutesOnMap(): Promise<void> {
    if (!this.map) return;

    this.routeLayerGroup.clearLayers();
    const allCoords: L.LatLngTuple[] = [MSU_CENTER];
    const totalRoutes = this.jobSheets.length;

    for (let jobIdx = 0; jobIdx < totalRoutes; jobIdx++) {
      const job = this.jobSheets[jobIdx];
      const routeColor = job.rider?.route_color || this.getDistinctRouteColor(jobIdx);
      const waypoints: L.LatLngTuple[] = [MSU_CENTER];

      job.stops.forEach((stop) => {
        if (stop.latitude && stop.longitude) {
          const latLng: L.LatLngTuple = [stop.latitude, stop.longitude];
          waypoints.push(latLng);
          allCoords.push(latLng);

          const stopIcon = L.divIcon({
            className: '',
            html: `
              <div style="
                background-color: ${routeColor};
                color: #ffffff;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 700;
                font-size: 13px;
                box-shadow: 0 2px 6px rgba(0,0,0,0.35);
                border: 2px solid #ffffff;
              ">
                ${stop.stop_seq}
              </div>
            `,
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          });

          L.marker(latLng, { icon: stopIcon })
            .addTo(this.routeLayerGroup)
            .bindPopup(`
              <strong>จุดส่งที่ ${stop.stop_seq}</strong> (${job.rider?.rider_code})<br>
              ผู้รับ: ${stop.order?.customer?.name || '-'}<br>
              เบอร์: ${stop.order?.customer?.phone || '-'}<br>
              ระยะทาง: ${stop.distance_km} กม.
            `);
        }
      });

      if (waypoints.length > 1) {
        try {
          const coordString = waypoints.map(pt => `${pt[1]},${pt[0]}`).join(';');
          const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`);
          const data = await res.json();

          const ordersText = this.getOrderIds(job);
          if (data.routes && data.routes.length > 0) {
            const rawRoadPoints: L.LatLngTuple[] = data.routes[0].geometry.coordinates.map(
              (c: [number, number]) => [c[1], c[0]] as L.LatLngTuple
            );

            const offsetPoints = this.offsetRoadCoords(rawRoadPoints, jobIdx, totalRoutes);

            L.polyline(offsetPoints, {
              color: routeColor,
              weight: 3.5,
              opacity: 0.9,
              lineJoin: 'round',
              lineCap: 'round'
            })
              .bindPopup(`<b>สายส่งของ ${job.rider?.rider_code}</b> (${job.job_code})<br>ออเดอร์: #${ordersText}<br>ระยะทาง: ${job.distance_km} กม.`)
              .addTo(this.routeLayerGroup);
          } else {
            const offsetWaypoints = this.offsetRoadCoords(waypoints, jobIdx, totalRoutes);
            L.polyline(offsetWaypoints, { color: routeColor, weight: 3.5, dashArray: '6, 6' })
              .bindPopup(`<b>สายส่งของ ${job.rider?.rider_code}</b> (${job.job_code})<br>ออเดอร์: #${ordersText}`)
              .addTo(this.routeLayerGroup);
          }
        } catch {
          const offsetWaypoints = this.offsetRoadCoords(waypoints, jobIdx, totalRoutes);
          L.polyline(offsetWaypoints, { color: routeColor, weight: 3.5, dashArray: '6, 6' }).addTo(this.routeLayerGroup);
        }
      }
    }

    if (allCoords.length > 1) {
      this.map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40] });
    }
  }

  private getAssignedRiders(): Rider[] {
    const uniqueRiders = new Map<number, Rider>();

    for (const job of this.jobSheets) {
      if (job.rider) {
        uniqueRiders.set(job.rider.rider_id, {
          rider_id: job.rider.rider_id,
          rider_code: job.rider.rider_code,
          route_color: job.rider.route_color,
          max_orders: job.rider.max_orders ?? 3
        });
      }
    }

    return Array.from(uniqueRiders.values());
  }

  // --- 5. ระบบจัดการ Cache & ตรวจสอบออเดอร์เปลี่ยนแปลงอัตโนมัติ ---
  private getOrdersSignature(orders: Order[]): string {
    return orders
      .map(o => `${o.order_id}:${o.qty}:${o.customer?.latitude}:${o.customer?.longitude}`)
      .sort()
      .join('|');
  }

  private saveCachedRoutes(ordersSignature?: string): void {
    try {
      const allOrders = this.jobSheets.flatMap(js => js.stops.map(s => s.order!).filter(Boolean));
      const signature = ordersSignature ?? this.getOrdersSignature(allOrders);

      const cache = {
        jobSheets: this.jobSheets,
        summary: this.summary,
        isCalculated: this.isCalculated,
        isDispatched: this.isDispatched,
        ordersSignature: signature
      };

      sessionStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
      console.error('ไม่สามารถบันทึกข้อมูลเส้นทางได้:', error);
    }
  }

  private async initRouteData(): Promise<void> {
    try {
      const cached = sessionStorage.getItem(ROUTE_CACHE_KEY);
      if (!cached) return;

      const data = JSON.parse(cached);
      if (!Array.isArray(data.jobSheets) || !data.summary) {
        sessionStorage.removeItem(ROUTE_CACHE_KEY);
        return;
      }

      try {
        const currentOrders = await this.loadOrders();
        const validCurrentOrders = currentOrders.filter(
          o => o.customer && Number.isFinite(o.customer.latitude) && Number.isFinite(o.customer.longitude) &&
               o.customer.latitude !== 0 && o.customer.longitude !== 0
        );
        const currentSig = this.getOrdersSignature(validCurrentOrders);

        if (data.ordersSignature && data.ordersSignature !== currentSig) {
          sessionStorage.removeItem(ROUTE_CACHE_KEY);
          if (validCurrentOrders.length > 0) {
            await this.executeRouting(validCurrentOrders);
          } else {
            this.jobSheets = [];
            this.calculateSummary();
            this.routeLayerGroup.clearLayers();
            this.isCalculated = false;
            this.isDispatched = false;
          }
          return;
        }
      } catch (err) {
        console.warn('ไม่สามารถเช็กออเดอร์ล่าสุดได้ ใช้ข้อมูลจาก Cache แทนชั่วคราว:', err);
      }

      this.jobSheets = data.jobSheets;
      this.summary = data.summary;
      this.isCalculated = data.isCalculated ?? false;
      this.isDispatched = data.isDispatched ?? false;

      if (this.isCalculated) {
        await this.renderRoutesOnMap();
      }
    } catch (error) {
      console.error('ไม่สามารถกู้คืนข้อมูลเส้นทางได้:', error);
    }
  }

  /**
   * กรองจุดพิกัดที่อยู่ชิดกันเกินไปออก เพื่อป้องกันเส้นหักมุมเป็นฟันปลาเวลาขยับขนาน
   */
  private simplifyCoords(coords: L.LatLngTuple[], minDist = 0.00012): L.LatLngTuple[] {
    if (coords.length <= 2) return coords;
    const result: L.LatLngTuple[] = [coords[0]];

    for (let i = 1; i < coords.length - 1; i++) {
      const last = result[result.length - 1];
      const dLat = coords[i][0] - last[0];
      const dLng = coords[i][1] - last[1];
      if (Math.sqrt(dLat * dLat + dLng * dLng) >= minDist) {
        result.push(coords[i]);
      }
    }

    result.push(coords[coords.length - 1]);
    return result;
  }

  /**
   * ขยับพิกัดเส้นทางให้ตีคู่ขนานกันภายในกรอบถนน ไม่บานออกนอกถนน
   */
  private offsetRoadCoords(coords: L.LatLngTuple[], routeIndex: number, totalRoutes: number): L.LatLngTuple[] {
    if (totalRoutes <= 1 || coords.length < 2) return coords;

    const cleanCoords = this.simplifyCoords(coords);

    const MAX_TOTAL_SPREAD = 0.00008;
    const step = Math.min(0.000016, MAX_TOTAL_SPREAD / Math.max(1, totalRoutes - 1));
    const shift = (routeIndex - (totalRoutes - 1) / 2) * step;

    if (shift === 0) return cleanCoords;

    return cleanCoords.map((pt, i) => {
      if (i === 0 || i === cleanCoords.length - 1) {
        return pt;
      }

      const prev = cleanCoords[i - 1];
      const next = cleanCoords[i + 1];

      const v1Lat = pt[0] - prev[0];
      const v1Lng = pt[1] - prev[1];
      const len1 = Math.sqrt(v1Lat * v1Lat + v1Lng * v1Lng) || 1;

      const v2Lat = next[0] - pt[0];
      const v2Lng = next[1] - pt[1];
      const len2 = Math.sqrt(v2Lat * v2Lat + v2Lng * v2Lng) || 1;

      const n1Lat = -v1Lng / len1;
      const n1Lng = v1Lat / len1;
      const n2Lat = -v2Lng / len2;
      const n2Lng = v2Lat / len2;

      let bisLat = n1Lat + n2Lat;
      let bisLng = n1Lng + n2Lng;
      const bisLen = Math.sqrt(bisLat * bisLat + bisLng * bisLng);

      if (bisLen < 0.001) {
        bisLat = n1Lat;
        bisLng = n1Lng;
      } else {
        bisLat /= bisLen;
        bisLng /= bisLen;
      }

      return [
        pt[0] + bisLat * shift,
        pt[1] + bisLng * shift
      ] as L.LatLngTuple;
    });
  }

  // --- 6. Backend HTTP Calls ---
  private async loadOrders(): Promise<Order[]> {
    const ordersData = await lastValueFrom(
      this.http.get<any[]>(`${API_BASE_URL}/orders`)
    );

    if (!ordersData || ordersData.length === 0) {
      return [];
    }

    const needJoin = ordersData.some(o => !o.customer && (!o.latitude || !o.longitude));
    const customersMap = new Map<number, Customer>();

    if (needJoin) {
      const customersData = await lastValueFrom(
        this.http.get<Customer[]>(`${API_BASE_URL}/customers`)
      );
      customersData.forEach(c => customersMap.set(c.customer_id, c));
    }

    return ordersData.map(o => {
      const matchedCust = customersMap.get(o.customer_id);
      return {
        order_id: o.order_id,
        customer_id: o.customer_id,
        delivery_fee: o.delivery_fee,
        qty: o.qty,
        date: o.date,
        customer: o.customer || matchedCust || {
          customer_id: o.customer_id,
          name: o.name || 'ลูกค้า',
          phone: o.phone || '-',
          latitude: Number(o.latitude),
          longitude: Number(o.longitude)
        }
      };
    });
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  private calculateSummary(): void {
    let ordersCount = 0;
    let boxesCount = 0;
    let distanceKm = 0;
    let maxTime = 0;
    let sales = 0;
    let foodCost = 0;

    this.jobSheets.forEach(job => {
      ordersCount += job.total_orders;
      boxesCount += job.total_boxes;
      distanceKm += job.distance_km;
      sales += job.sales;
      foodCost += job.food_cost;
      if (job.duration_min > maxTime) maxTime = job.duration_min;
    });

    const riderCount = this.jobSheets.length;
    const riderBaseCost = riderCount * CONFIG.RIDER_BASE_FEE;
    const distanceCost = this.jobSheets.reduce((sum, j) => sum + (j.distance_km * j.total_boxes * CONFIG.FUEL_RATE_PER_KM_BOX), 0);
    const netProfit = sales - foodCost - (distanceCost + riderBaseCost);

    const finishDate = new Date();
    finishDate.setHours(11, 30 + maxTime, 0);
    const formattedMinutes = finishDate.getMinutes().toString().padStart(2, '0');

    this.summary = {
      totalOrders: ordersCount,
      totalRiders: riderCount,
      totalBoxes: boxesCount,
      totalDistanceKm: Math.round(distanceKm * 10) / 10,
      maxDurationMin: maxTime,
      sales,
      foodCost,
      deliveryDistanceCost: Math.round(distanceCost * 10) / 10,
      riderBaseCost,
      netProfit: Math.round(netProfit * 100) / 100,
      estimatedFinishTime: `${finishDate.getHours()}:${formattedMinutes} น.`
    };
  }

  private getDistinctRouteColor(index: number): string {
    const hue = (index * 137.508) % 360;
    const saturation = 75 + (index % 3) * 7;
    const lightness = 40 + (index % 2) * 8;
    return this.hslToHex(hue, saturation, lightness);
  }

  private hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) =>
      l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = (x: number) =>
      Math.round(x * 255).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`.toUpperCase();
  }
}