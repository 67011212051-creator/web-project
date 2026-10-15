import {
  Component, OnInit, AfterViewInit, OnDestroy, ElementRef,
  inject, viewChild
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { lastValueFrom } from 'rxjs';
import * as L from 'leaflet';
// ปรับจำนวน ../ ให้ตรงกับตำแหน่งไฟล์จริงของคุณ
import { environment } from '../../../environments/environment';
import { getCustomersResponse } from '../../../../models/get-customers-res';
import { Order, Rider, JobStop, JobSheet } from '../../../../models/route-planning-res';

// พิกัดร้านค้าศูนย์กลาง (ตรงกับหน้า Customers)
const MSU_CENTER: L.LatLngTuple = [16.2466557, 103.2517639];

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
    estimatedFinishTime: '12:30 น.'
  };

  ngOnInit(): void {}

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.map?.remove();
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
    if (this.jobSheets.length === 0) return;
    this.isSaving = true;

    try {
      await lastValueFrom(
        this.http.post(`${environment.apiUrl}/job-sheets/dispatch`, {
          jobSheets: this.jobSheets
        })
      );

      this.isDispatched = true;
      alert('บันทึกใบงานและส่งมอบให้ไรเดอร์เรียบร้อยแล้ว!');
    } catch (error) {
      console.error('Error dispatching jobs:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกใบงานผ่าน API');
    } finally {
      this.isSaving = false;
    }
  }

  // --- 3. Routing Engine ---
  private async executeRouting(): Promise<void> {
    this.isLoading = true;

    try {
      const [orders, riders] = await Promise.all([
        this.loadOrders(),
        this.loadRiders()
      ]);

      this.jobSheets = this.computeGreedyRoutes(orders, riders);
      this.calculateSummary();
      await this.renderRoutesOnMap();

      this.isCalculated = true;
      this.isDispatched = false;
    } catch (error) {
      console.error('Route calculation error:', error);
      alert('เกิดข้อผิดพลาดในการคำนวณเส้นทาง');
    } finally {
      this.isLoading = false;
    }
  }

  private computeGreedyRoutes(orders: Order[], availableRiders: Rider[]): JobSheet[] {
    const unassigned = orders
      .filter(o => o.customer && o.customer.latitude && o.customer.longitude)
      .map(o => ({ ...o }));

    const jobSheets: JobSheet[] = [];
    let riderIndex = 0;

    while (unassigned.length > 0) {
      const currentRider = availableRiders[riderIndex % availableRiders.length] || {
        rider_id: riderIndex + 1,
        rider_code: `RD${String(riderIndex + 1).padStart(2, '0')}`,
        route_color: '#3a7bd5',
        max_orders: 3
      };

      let currentLoc: [number, number] = [MSU_CENTER[0], MSU_CENTER[1]];
      let currentDistance = 0;
      let currentTime = 0;
      let currentBoxes = 0;
      const stops: JobStop[] = [];

      while (stops.length < CONFIG.MAX_ORDERS_PER_ROUTE && unassigned.length > 0) {
        let nearestIdx = -1;
        let shortestDist = Infinity;
        let travelTime = 0;

        for (let i = 0; i < unassigned.length; i++) {
          const candidate = unassigned[i];
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

        if (nearestIdx === -1) break;

        const [selected] = unassigned.splice(nearestIdx, 1);
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

      const deliveryCost = CONFIG.RIDER_BASE_FEE + (currentDistance * currentBoxes * CONFIG.FUEL_RATE_PER_KM_BOX);
      const sales = currentBoxes * CONFIG.PRICE_PER_BOX;
      const foodCost = currentBoxes * CONFIG.FOOD_COST_PER_BOX;
      const netProfit = sales - foodCost - deliveryCost;

      const shortTime = Date.now().toString().slice(-6);
      const rand = Math.floor(10 + Math.random() * 90);
      const jobCode = `J-${shortTime}-${rand}-${currentRider.rider_code}`.slice(0, 20);

      jobSheets.push({
        job_code: jobCode,
        rider_id: currentRider.rider_id,
        rider: currentRider,
        distance_km: Math.round(currentDistance * 100) / 100,
        duration_min: Math.round(currentTime),
        rider_pay: Math.round(deliveryCost * 100) / 100,
        total_boxes: currentBoxes,
        total_orders: stops.length,
        sales,
        food_cost: foodCost,
        net_profit: Math.round(netProfit * 100) / 100,
        stops
      });

      riderIndex++;
    }

    return jobSheets;
  }

// --- 4. วาดเส้นตามถนนจริง OSRM (พร้อมขยับเส้นขนานกันไม่ให้ทับกัน) ---
  private async renderRoutesOnMap(): Promise<void> {
    if (!this.map) return;

    this.routeLayerGroup.clearLayers();
    const allCoords: L.LatLngTuple[] = [MSU_CENTER];
    const totalRoutes = this.jobSheets.length;

    for (let jobIdx = 0; jobIdx < totalRoutes; jobIdx++) {
      const job = this.jobSheets[jobIdx];
      const routeColor = job.rider?.route_color || '#3a7bd5';
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

          if (data.routes && data.routes.length > 0) {
            const rawRoadPoints: L.LatLngTuple[] = data.routes[0].geometry.coordinates.map(
              (c: [number, number]) => [c[1], c[0]] as L.LatLngTuple
            );

            // ขยับเส้นแต่ละสายให้ตีคู่ขนานกันตามลำดับไรเดอร์
            const offsetPoints = this.offsetRoadCoords(rawRoadPoints, jobIdx, totalRoutes);

            L.polyline(offsetPoints, {
              color: routeColor,
              weight: 4.5,
              opacity: 0.9
            })
              .bindPopup(`<b>สายส่งของ ${job.rider?.rider_code}</b> (${job.distance_km} กม.)`)
              .addTo(this.routeLayerGroup);
          } else {
            const offsetWaypoints = this.offsetRoadCoords(waypoints, jobIdx, totalRoutes);
            L.polyline(offsetWaypoints, { color: routeColor, weight: 4, dashArray: '6, 6' }).addTo(this.routeLayerGroup);
          }
        } catch {
          const offsetWaypoints = this.offsetRoadCoords(waypoints, jobIdx, totalRoutes);
          L.polyline(offsetWaypoints, { color: routeColor, weight: 4, dashArray: '6, 6' }).addTo(this.routeLayerGroup);
        }
      }
    }

    if (allCoords.length > 1) {
      this.map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40] });
    }
  }

  /**
   * คำนวณขยับพิกัดเส้นทางให้ตีคู่ขนานกัน (ไม่ทับกันเมื่อวิ่งบนถนนเส้นเดียวกัน)
   */
  private offsetRoadCoords(coords: L.LatLngTuple[], routeIndex: number, totalRoutes: number): L.LatLngTuple[] {
    if (totalRoutes <= 1 || coords.length < 2) return coords;

    // ระยะห่างระหว่างเส้น (ประมาณ 10 เมตรบนแผนที่)
    const OFFSET_STEP = 0.00011;
    const shift = (routeIndex - (totalRoutes - 1) / 2) * OFFSET_STEP;

    if (shift === 0) return coords;

    return coords.map((pt, i) => {
      const prev = coords[i > 0 ? i - 1 : i];
      const next = coords[i < coords.length - 1 ? i + 1 : i];

      const dLat = next[0] - prev[0];
      const dLng = next[1] - prev[1];
      const len = Math.sqrt(dLat * dLat + dLng * dLng);

      if (len === 0) {
        return [pt[0] + shift, pt[1] + shift] as L.LatLngTuple;
      }

      // หาเวกเตอร์ตั้งฉาก (Normal Vector) เพื่อขยับเส้นออกด้านข้างของถนนอย่างสม่ำเสมอทุกโค้ง
      const normLat = -dLng / len;
      const normLng = dLat / len;

      return [
        pt[0] + normLat * shift,
        pt[1] + normLng * shift
      ] as L.LatLngTuple;
    });
  }

  // --- 5. Backend HTTP Calls ---
  private async loadOrders(): Promise<Order[]> {
    try {
      const ordersData = await lastValueFrom(
        this.http.get<any[]>(`${environment.apiUrl}/orders`)
      );

      if (ordersData && ordersData.length > 0) {
        // หาก orders ขาดข้อมูล customer ให้ดึงรายชื่อลูกค้าจาก /customers มาจับคู่
        const needJoin = ordersData.some(o => !o.customer && (!o.latitude || !o.longitude));
        let customersMap = new Map<number, getCustomersResponse>();

        if (needJoin) {
          try {
            const customersData = await lastValueFrom(
              this.http.get<getCustomersResponse[]>(`${environment.apiUrl}/customers`)
            );
            customersData.forEach(c => customersMap.set(c.customer_id, c));
          } catch (e) {
            console.warn('Could not fetch /customers to join with orders:', e);
          }
        }

        return ordersData.map(o => {
          const matchedCust = customersMap.get(o.customer_id);
          return {
            order_id: o.order_id,
            round_id: o.round_id,
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
    } catch (err) {
      console.warn('Backend /orders failed, using fallback:', err);
    }

    return this.getMockOrders();
  }

  private async loadRiders(): Promise<Rider[]> {
    try {
      const data = await lastValueFrom(
        this.http.get<Rider[]>(`${environment.apiUrl}/riders`)
      );
      if (data && data.length > 0) return data;
    } catch (err) {
      console.warn('Backend /riders failed, using fallback:', err);
    }

    return [
      { rider_id: 1, rider_code: 'RD01', route_color: '#E63946', max_orders: 3 },
      { rider_id: 2, rider_code: 'RD02', route_color: '#2A9D8F', max_orders: 3 },
      { rider_id: 3, rider_code: 'RD03', route_color: '#457B9D', max_orders: 3 }
    ];
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

  private getMockOrders(): Order[] {
    return [
      { order_id: 1, customer_id: 3, delivery_fee: 10, qty: 2, date: '2026-10-09', customer: { customer_id: 3, name: 'คุณณัฐณิชา วงศ์คำ', phone: '095-148-3356', latitude: 16.254242, longitude: 103.240783 } },
      { order_id: 2, customer_id: 4, delivery_fee: 10, qty: 1, date: '2026-10-09', customer: { customer_id: 4, name: 'คุณธนกร ศรีบุญเรือง', phone: '086-552-4108', latitude: 16.248976, longitude: 103.259183 } },
      { order_id: 3, customer_id: 5, delivery_fee: 10, qty: 2, date: '2026-10-09', customer: { customer_id: 5, name: 'คุณพิมพ์ชนก ใจดี', phone: '092-883-7124', latitude: 16.243858, longitude: 103.256836 } },
      { order_id: 4, customer_id: 7, delivery_fee: 10, qty: 1, date: '2026-10-09', customer: { customer_id: 7, name: 'phanuwat', phone: '1234567890', latitude: 16.2541909, longitude: 103.2406816 } },
      { order_id: 5, customer_id: 9, delivery_fee: 10, qty: 2, date: '2026-10-09', customer: { customer_id: 9, name: 'test test', phone: '088-888-8888', latitude: 16.2480946, longitude: 103.2531595 } }
    ];
  }
}