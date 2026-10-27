import express from "express";
import { dbconnect } from "../dbconnect";

export const router = express.Router();

const MSU_CENTER: [number, number] = [16.2466557, 103.2517639];
const MAX_SERVICE_RADIUS_KM = 3.0; // เงื่อนไขข้อ 3: รัศมีให้บริการไม่เกิน 3 กม.
const OSRM_TIMEOUT_MS = 8000;
const OSRM_MAX_COORDS = 100;

const ROUTE_CONFIG = {
  SPEED_KMH: 30,
  TIME_PER_STOP_MIN: 3,
  MAX_ORDERS_PER_ROUTE: 3,
  PRICE_PER_BOX: 65,
  FOOD_COST_PER_BOX: 40,
  RIDER_BASE_FEE: 15,
  FUEL_RATE_PER_KM_BOX: 2,
  MAX_DELIVERY_MIN: 60,
};

const ALGO_NAMES = [
  "รูปแบบที่ 1: Sweep Algorithm (แบ่งโซนตามทิศทางรอบร้าน + ถนนจริง)",
  "รูปแบบที่ 2: Clarke-Wright Savings (จับคู่จุดส่งที่ประหยัดระยะถนนสูงสุด)",
  "รูปแบบที่ 3: Clarke-Wright + Local Search (ปรับสายส่งให้ต้นทุนต่ำสุด)",
];
const ALGO_COUNT = ALGO_NAMES.length;

type DistanceSource = "osrm" | "fallback" | "none";
const DEADLINE_MIN = 12 * 60 + 30; // ต้องส่งครบภายใน 12:30 น.
const START_MIN = 11 * 60 + 30; // ออกเดินทาง 11:30 น.

type RouteOrder = {
  order_id: number;
  customer_id: number;
  delivery_fee: number;
  qty: number;
  customer: {
    customer_id: number;
    name: string;
    phone: string;
    latitude: number;
    longitude: number;
  };
};

type RouteStop = {
  order_id: number;
  stop_seq: number;
  distance_km: number;
  travel_time_min: number;
  delivery_time_min: number;
  latitude: number;
  longitude: number;
  order: RouteOrder;
};

type RouteJobSheet = {
  job_code: string;
  rider_id: number;
  rider: {
    rider_id: number;
    rider_code: string;
    route_color: string;
    max_orders: number;
  };
  distance_km: number;
  duration_min: number;
  rider_pay: number;
  total_boxes: number;
  total_orders: number;
  sales: number;
  food_cost: number;
  net_profit: number;
  order_ids: number[];
  stops: RouteStop[];
};

// ใช้สำหรับตรวจสอบขอบเขตวงกลมรัศมี 3 กม. รอบร้านค้า
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * เงื่อนไขข้อ 2: ดึงตารางระยะทางตามถนนจริง (Road Distance Matrix) จาก OSRM Table API
 * Index 0 = ร้านค้า (MSU_CENTER), Index 1..N = ลูกค้าแต่ละคนตามลำดับใน orders
 * - มี timeout, ตรวจสถานะ HTTP / code ของ OSRM
 * - cell ที่ OSRM ตอบ null จะใช้ค่าประมาณ (Haversine x 1.3) เฉพาะ cell นั้น ไม่ใช้ Infinity
 * - ถ้าล้มเหลวทั้งหมดจะ Fallback เป็นค่าประมาณทั้งตาราง และบอก source กลับไป
 */
async function fetchRoadDistanceMatrix(
  orders: RouteOrder[]
): Promise<{ matrix: number[][]; source: DistanceSource }> {
  const coords: [number, number][] = [
    MSU_CENTER,
    ...orders.map(
      (o) => [o.customer.latitude, o.customer.longitude] as [number, number]
    ),
  ];

  const estimated = (): number[][] =>
    coords.map((from) =>
      coords.map((to) => haversine(from[0], from[1], to[0], to[1]) * 1.3)
    );

  // OSRM public server จำกัดจำนวนพิกัดต่อ request (~100)
  if (coords.length > OSRM_MAX_COORDS) {
    console.warn(
      `OSRM table limit exceeded (${coords.length} > ${OSRM_MAX_COORDS}), using estimated road factor`
    );
    return { matrix: estimated(), source: "fallback" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

  try {
    const coordString = coords.map((pt) => `${pt[1]},${pt[0]}`).join(";");
    const url = `https://router.project-osrm.org/table/v1/driving/${coordString}?annotations=distance`;

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

    const data: any = await res.json();
    if (data?.code !== "Ok" || !Array.isArray(data.distances)) {
      throw new Error(`OSRM response code: ${data?.code}`);
    }

    const est = estimated();
    const matrix = data.distances.map((row: (number | null)[], i: number) =>
      row.map((distMeters, j) =>
        distMeters == null || !Number.isFinite(distMeters)
          ? est[i]![j]!
          : distMeters / 1000
      )
    );
    return { matrix, source: "osrm" };
  } catch (err) {
    console.warn("OSRM Table API failed, using estimated road factor:", err);
    return { matrix: estimated(), source: "fallback" };
  } finally {
    clearTimeout(timer);
  }
}

function routeColor(index: number): string {
  const hue = (index * 137.508) % 360;
  const saturation = 75 + (index % 3) * 7;
  const lightness = 40 + (index % 2) * 8;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = (saturation / 100) * Math.min(lightness / 100, 1 - lightness / 100);
  const channel = (n: number) => {
    const value =
      lightness / 100 -
      a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}

function getOrdersSignature(orders: RouteOrder[]): string {
  return orders
    .map(
      (order) =>
        `${order.order_id}:${order.qty}:${order.customer.latitude}:${order.customer.longitude}`
    )
    .sort()
    .join("|");
}

/**
 * อัลกอริทึมที่ 2 (index = 1): Sweep Algorithm (แบ่งโซนตามมุมทิศทางรอบร้าน + เรียงจุดในโซนด้วยระยะถนนจริง)
 */
function runSweepRoad(
  orders: RouteOrder[],
  roadMatrix: number[][]
): number[][] {
  const nodesWithAngle = orders.map((order, idx) => ({
    node: idx + 1,
    angle: Math.atan2(
      order.customer.latitude - MSU_CENTER[0],
      order.customer.longitude - MSU_CENTER[1]
    ),
  }));

  nodesWithAngle.sort((a, b) => a.angle - b.angle);

  // หมุนจุดเริ่มไปอยู่หลัง "ช่องว่างมุมที่กว้างที่สุด" เพื่อไม่ให้รอยต่อ ±π
  // ตัดกลุ่มลูกค้าที่อยู่ติดกันออกจากกัน
  if (nodesWithAngle.length > 1) {
    let maxGap = -1;
    let startIdx = 0;
    for (let i = 0; i < nodesWithAngle.length; i++) {
      const cur = nodesWithAngle[i]!.angle;
      const next =
        i === nodesWithAngle.length - 1
          ? nodesWithAngle[0]!.angle + 2 * Math.PI
          : nodesWithAngle[i + 1]!.angle;
      if (next - cur > maxGap) {
        maxGap = next - cur;
        startIdx = (i + 1) % nodesWithAngle.length;
      }
    }
    nodesWithAngle.push(...nodesWithAngle.splice(0, startIdx));
  }

  const sortedNodes = nodesWithAngle.map((item) => item.node);
  const routes: number[][] = [];

  while (sortedNodes.length > 0) {
    const cluster = sortedNodes.splice(0, ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE);
    const orderedRoute: number[] = [];
    let currNode = 0;
    let currTime = 0;

    while (cluster.length > 0) {
      let bestIdx = 0;
      let shortestRoadDist = Infinity;

      for (let i = 0; i < cluster.length; i++) {
        const candidateNode = cluster[i]!;
        const roadDist = roadMatrix[currNode]![candidateNode]!;
        if (roadDist < shortestRoadDist) {
          shortestRoadDist = roadDist;
          bestIdx = i;
        }
      }

      const [nextNode] = cluster.splice(bestIdx, 1);
      if (nextNode === undefined) break;

      const tTime = (shortestRoadDist / ROUTE_CONFIG.SPEED_KMH) * 60;

      if (
        orderedRoute.length > 0 &&
        currTime + tTime + ROUTE_CONFIG.TIME_PER_STOP_MIN >
          ROUTE_CONFIG.MAX_DELIVERY_MIN
      ) {
        sortedNodes.unshift(nextNode, ...cluster);
        break;
      }

      orderedRoute.push(nextNode);
      currTime += tTime + ROUTE_CONFIG.TIME_PER_STOP_MIN;
      currNode = nextNode;
    }

    if (orderedRoute.length > 0) routes.push(orderedRoute);
  }

  return routes;
}

/**
 * อัลกอริทึมที่ 3 (index = 2): Clarke-Wright Savings Algorithm โดยใช้ระยะทางถนนจริง
 */
function runClarkeWrightRoad(
  orders: RouteOrder[],
  roadMatrix: number[][]
): number[][] {
  const n = orders.length;
  const routes: number[][] = Array.from({ length: n }, (_, i) => [i + 1]);

  // คำนวณค่าความประหยัดระยะทางถนนจริง S(i,j) = d(0,i) + d(0,j) - d(i,j)
  const savings: { i: number; j: number; s: number }[] = [];
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= n; j++) {
      if (i !== j) {
        const s =
          roadMatrix[0]![i]! + roadMatrix[0]![j]! - roadMatrix[i]![j]!;
        if (Number.isFinite(s)) savings.push({ i, j, s });
      }
    }
  }

  savings.sort((a, b) => b.s - a.s);

  const calcRouteTime = (route: number[]): number => {
    let time = 0;
    let curr = 0;
    for (const node of route) {
      time +=
        (roadMatrix[curr]![node]! / ROUTE_CONFIG.SPEED_KMH) * 60 +
        ROUTE_CONFIG.TIME_PER_STOP_MIN;
      curr = node;
    }
    return time;
  };

  for (const { i, j } of savings) {
    const rI = routes.findIndex((r) => r[r.length - 1] === i);
    const rJ = routes.findIndex((r) => r[0] === j);

    if (rI !== -1 && rJ !== -1 && rI !== rJ) {
      const merged = [...routes[rI]!, ...routes[rJ]!];
      if (
        merged.length <= ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE &&
        calcRouteTime(merged) <= ROUTE_CONFIG.MAX_DELIVERY_MIN
      ) {
        routes[rI] = merged;
        routes.splice(rJ, 1);
      }
    }
  }

  return routes;
}

/**
 * อัลกอริทึมที่ 4 (index = 3): Clarke-Wright + Local Search
 * เริ่มจากผลของ Clarke-Wright แล้วปรับปรุงด้วย
 *  1) ลองทุกลำดับจุดภายในสาย (สายละไม่เกิน 3 จุด = 6 แบบ ได้ลำดับที่ดีที่สุดแน่นอน)
 *  2) ย้ายจุดข้ามสาย (relocate) และสลับจุดข้ามสาย (swap)
 * โดยใช้ "ต้นทุนส่งจริง" เป็นเป้าหมาย: ค่าเรียกไรเดอร์ + ระยะทาง x กล่อง x อัตราน้ำมัน
 * และไม่ยอมรับการเปลี่ยนที่ทำให้สายใดเกินเวลา MAX_DELIVERY_MIN
 */
function runClarkeWrightLocalSearch(
  orders: RouteOrder[],
  roadMatrix: number[][]
): number[][] {
  const boxesOf = (node: number) => orders[node - 1]!.qty;

  const distanceOf = (route: number[]): number => {
    let dist = 0;
    let curr = 0;
    for (const node of route) {
      dist += roadMatrix[curr]![node]!;
      curr = node;
    }
    return dist;
  };

  const durationOf = (route: number[]): number =>
    (distanceOf(route) / ROUTE_CONFIG.SPEED_KMH) * 60 +
    route.length * ROUTE_CONFIG.TIME_PER_STOP_MIN;

  const costOf = (route: number[]): number => {
    if (route.length === 0) return 0;
    const boxes = route.reduce((sum, node) => sum + boxesOf(node), 0);
    return (
      ROUTE_CONFIG.RIDER_BASE_FEE +
      distanceOf(route) * boxes * ROUTE_CONFIG.FUEL_RATE_PER_KM_BOX
    );
  };

  const permutations = (arr: number[]): number[][] =>
    arr.length <= 1
      ? [arr]
      : arr.flatMap((x, i) =>
          permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [
            x,
            ...p,
          ])
        );

  // ลำดับจุดที่ระยะสั้นที่สุดภายในสาย (จำนวนกล่องในสายคงที่ จึงเทียบด้วยระยะทางได้)
  const bestOrder = (route: number[]): number[] => {
    if (route.length <= 1) return route;
    let best = route;
    let bestDist = distanceOf(route);
    for (const p of permutations(route)) {
      const d = distanceOf(p);
      if (d < bestDist - 1e-9) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  };

  const maxStops = ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE;
  const maxMin = ROUTE_CONFIG.MAX_DELIVERY_MIN;

  let routes = runClarkeWrightRoad(orders, roadMatrix).map(bestOrder);

  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;

    for (let a = 0; a < routes.length && !improved; a++) {
      for (let b = 0; b < routes.length && !improved; b++) {
        if (a === b) continue;
        const ra = routes[a]!;
        const rb = routes[b]!;
        const before = costOf(ra) + costOf(rb);

        // relocate: ย้ายจุด i จากสาย a ไปสาย b
        if (rb.length < maxStops) {
          for (let i = 0; i < ra.length && !improved; i++) {
            const newA = bestOrder(ra.filter((_, k) => k !== i));
            const newB = bestOrder([...rb, ra[i]!]);
            if (durationOf(newB) > maxMin) continue;
            if (costOf(newA) + costOf(newB) < before - 1e-6) {
              routes[a] = newA;
              routes[b] = newB;
              improved = true;
            }
          }
        }

        // swap: สลับจุด i ของสาย a กับจุด j ของสาย b
        if (a < b) {
          for (let i = 0; i < ra.length && !improved; i++) {
            for (let j = 0; j < rb.length && !improved; j++) {
              const newA = bestOrder(ra.map((n, k) => (k === i ? rb[j]! : n)));
              const newB = bestOrder(rb.map((n, k) => (k === j ? ra[i]! : n)));
              if (durationOf(newA) > maxMin || durationOf(newB) > maxMin) continue;
              if (costOf(newA) + costOf(newB) < before - 1e-6) {
                routes[a] = newA;
                routes[b] = newB;
                improved = true;
              }
            }
          }
        }
      }
    }

    routes = routes.filter((r) => r.length > 0);
  }

  return routes;
}

async function calculateRoutes(orders: RouteOrder[], algoIndex: number) {
  if (orders.length === 0) {
    return {
      jobSheets: [] as RouteJobSheet[],
      summary: {
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
        estimatedFinishTime: "11:30 น.",
        onTime: true,
      },
      distanceSource: "none" as DistanceSource,
    };
  }

  // 1. ดึงตารางระยะทางตามถนนจริงจาก OSRM Table API
  const { matrix: roadMatrix, source: distanceSource } =
    await fetchRoadDistanceMatrix(orders);

  // 2. เลือกรันอัลกอริทึมตามลำดับที่ผู้ใช้กดปุ่ม (0, 1, 2)
  let routeGroups: number[][] = [];
  if (algoIndex === 0) {
    routeGroups = runSweepRoad(orders, roadMatrix);
  } else if (algoIndex === 1) {
    routeGroups = runClarkeWrightRoad(orders, roadMatrix);
  } else {
    routeGroups = runClarkeWrightLocalSearch(orders, roadMatrix);
  }

  // 3. สร้างใบงานและคำนวณต้นทุนจากระยะทางถนนจริง
  const jobSheets: RouteJobSheet[] = routeGroups.map(
    (routeNodeIndices, riderIndex) => {
      let currentLocNode = 0; // 0 = ร้านค้า
      let currentDistance = 0;
      let currentTime = 0;
      let currentBoxes = 0;
      const stops: RouteStop[] = [];

      routeNodeIndices.forEach((nodeIdx, idx) => {
        const selected = orders[nodeIdx - 1]!;
        const roadDistKm = roadMatrix[currentLocNode]![nodeIdx]!;
        const travelTime = (roadDistKm / ROUTE_CONFIG.SPEED_KMH) * 60;

        stops.push({
          order_id: selected.order_id,
          stop_seq: idx + 1,
          distance_km: Math.round(roadDistKm * 100) / 100,
          travel_time_min: travelTime,
          delivery_time_min: ROUTE_CONFIG.TIME_PER_STOP_MIN,
          latitude: selected.customer.latitude,
          longitude: selected.customer.longitude,
          order: selected,
        });

        currentDistance += roadDistKm;
        currentTime += travelTime + ROUTE_CONFIG.TIME_PER_STOP_MIN;
        currentBoxes += selected.qty;
        currentLocNode = nodeIdx;
      });

      const rider = {
        rider_id: riderIndex + 1,
        rider_code: `RD${String(riderIndex + 1).padStart(2, "0")}`,
        route_color: routeColor(riderIndex),
        max_orders: ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE,
      };

      const deliveryCost =
        ROUTE_CONFIG.RIDER_BASE_FEE +
        currentDistance * currentBoxes * ROUTE_CONFIG.FUEL_RATE_PER_KM_BOX;
      const sales = currentBoxes * ROUTE_CONFIG.PRICE_PER_BOX;
      const foodCost = currentBoxes * ROUTE_CONFIG.FOOD_COST_PER_BOX;
      const netProfit = sales - foodCost - deliveryCost;
      const shortTime = Date.now().toString().slice(-6);
      const randomSuffix = Math.floor(10 + Math.random() * 90);
      const jobCode = `J-${shortTime}-${randomSuffix}-${rider.rider_code}`.slice(
        0,
        20
      );

      return {
        job_code: jobCode,
        rider_id: rider.rider_id,
        rider,
        distance_km: Math.round(currentDistance * 100) / 100,
        duration_min: Math.round(currentTime),
        rider_pay: Math.round(deliveryCost * 100) / 100,
        total_boxes: currentBoxes,
        total_orders: stops.length,
        sales,
        food_cost: foodCost,
        net_profit: Math.round(netProfit * 100) / 100,
        order_ids: stops.map((stop) => stop.order_id),
        stops,
      };
    }
  );

  const totalOrders = jobSheets.reduce((sum, job) => sum + job.total_orders, 0);
  const totalBoxes = jobSheets.reduce((sum, job) => sum + job.total_boxes, 0);
  const totalDistanceKm = jobSheets.reduce(
    (sum, job) => sum + job.distance_km,
    0
  );
  const maxDurationMin = jobSheets.reduce(
    (max, job) => Math.max(max, job.duration_min),
    0
  );
  const sales = jobSheets.reduce((sum, job) => sum + job.sales, 0);
  const foodCost = jobSheets.reduce((sum, job) => sum + job.food_cost, 0);
  const riderBaseCost = jobSheets.length * ROUTE_CONFIG.RIDER_BASE_FEE;
  const deliveryDistanceCost = jobSheets.reduce(
    (sum, job) =>
      sum +
      job.distance_km * job.total_boxes * ROUTE_CONFIG.FUEL_RATE_PER_KM_BOX,
    0
  );
  const finishMinutes = START_MIN + maxDurationMin;
  const finishHours = Math.floor(finishMinutes / 60) % 24;
  const formattedMinutes = String(finishMinutes % 60).padStart(2, "0");

  return {
    jobSheets,
    summary: {
      totalOrders,
      totalRiders: jobSheets.length,
      totalBoxes,
      totalDistanceKm: Math.round(totalDistanceKm * 10) / 10,
      maxDurationMin,
      sales,
      foodCost,
      deliveryDistanceCost: Math.round(deliveryDistanceCost * 10) / 10,
      riderBaseCost,
      netProfit:
        Math.round(
          (sales - foodCost - deliveryDistanceCost - riderBaseCost) * 100
        ) / 100,
      estimatedFinishTime: `${finishHours}:${formattedMinutes} น.`,
      onTime: finishMinutes <= DEADLINE_MIN,
    },
    distanceSource,
  };
}

router.get("/code/:jobCode", async (req, res) => {
  const jobCode = String(req.params.jobCode ?? "")
    .trim()
    .toUpperCase();

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
  const customerById = new Map(
    customers.map((customer) => [customer.customer_id, customer])
  );

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

router.post("/calculate", async (req, res) => {
  try {
    const rawAlgo = Number(req.body?.algorithmIndex);
    const algoIndex =
      Number.isInteger(rawAlgo) && rawAlgo >= 0 ? rawAlgo % ALGO_COUNT : 0;

    const { data: orderRows, error: ordersError } = await dbconnect
      .from("orders")
      .select("order_id, customer_id, delivery_fee, qty");

    if (ordersError) {
      res.status(500).json({ error: ordersError.message });
      return;
    }

    const orders = orderRows ?? [];
    const customerIds = [...new Set(orders.map((order) => order.customer_id))];
    let customerById = new Map();

    if (customerIds.length > 0) {
      const { data: customerRows, error: customersError } = await dbconnect
        .from("customers")
        .select("customer_id, name, phone, latitude, longitude")
        .in("customer_id", customerIds);

      if (customersError) {
        res.status(500).json({ error: customersError.message });
        return;
      }

      customerById = new Map(
        (customerRows ?? []).map((customer) => [
          customer.customer_id,
          {
            ...customer,
            latitude: Number(customer.latitude),
            longitude: Number(customer.longitude),
          },
        ])
      );
    }

    const allValidOrders: RouteOrder[] = orders.flatMap((order) => {
      const customer = customerById.get(order.customer_id);
      if (
        !customer ||
        !Number.isFinite(customer.latitude) ||
        !Number.isFinite(customer.longitude) ||
        customer.latitude === 0 ||
        customer.longitude === 0
      ) {
        return [];
      }

      return [
        {
          ...order,
          delivery_fee: Number(order.delivery_fee),
          qty: Number(order.qty),
          customer,
        },
      ];
    });

    // เงื่อนไขข้อ 3: กรองเฉพาะลูกค้าที่อยู่ในรัศมี 3 กม. จากร้านค้า
    const inRangeOrders = allValidOrders.filter((order) => {
      const distFromShopKm = haversine(
        MSU_CENTER[0],
        MSU_CENTER[1],
        order.customer.latitude,
        order.customer.longitude
      );
      return distFromShopKm <= MAX_SERVICE_RADIUS_KM;
    });

    const excludedOutOfRangeCount =
      allValidOrders.length - inRangeOrders.length;
    // ออเดอร์ที่ลูกค้ายังไม่มีพิกัดที่ใช้งานได้ (ไม่ถูกนำมาคำนวณ)
    const invalidCoordCount = orders.length - allValidOrders.length;

    const result = await calculateRoutes(inRangeOrders, algoIndex);
    res.json({
      ...result,
      ordersSignature: getOrdersSignature(allValidOrders),
      algorithmIndex: algoIndex,
      algorithmName: ALGO_NAMES[algoIndex],
      excludedOutOfRangeCount,
      invalidCoordCount,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Route calculation error" });
  }
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

  res.json({ message: "Deleted successfully", data });
});

router.post("/dispatch", async (req, res) => {
  const { jobSheets, riders } = req.body ?? {};

  if (
    !Array.isArray(jobSheets) ||
    jobSheets.length === 0 ||
    !Array.isArray(riders) ||
    riders.length === 0 ||
    riders.some(
      (rider: any) =>
        !rider ||
        typeof rider.rider_code !== "string" ||
        typeof rider.route_color !== "string"
    )
  ) {
    res.status(400).json({ error: "Invalid job sheets or riders data" });
    return;
  }

  const riderCodes = new Set(riders.map((rider: any) => rider.rider_code));
  if (
    jobSheets.some(
      (jobSheet: any) =>
        !jobSheet ||
        typeof jobSheet.job_code !== "string" ||
        !jobSheet.rider ||
        !riderCodes.has(jobSheet.rider.rider_code) ||
        !Array.isArray(jobSheet.stops)
    )
  ) {
    res
      .status(400)
      .json({ error: "Invalid job sheet or unknown rider reference" });
    return;
  }

  const { error: stopsDeleteError } = await dbconnect
    .from("job_stops")
    .delete()
    .not("job_id", "is", null);

  if (stopsDeleteError) {
    res.status(500).json({ error: stopsDeleteError.message });
    return;
  }

  const { error: sheetsDeleteError } = await dbconnect
    .from("job_sheets")
    .delete()
    .not("job_id", "is", null);

  if (sheetsDeleteError) {
    res.status(500).json({ error: sheetsDeleteError.message });
    return;
  }

  const { error: ridersDeleteError } = await dbconnect
    .from("riders")
    .delete()
    .not("rider_id", "is", null);

  if (ridersDeleteError) {
    res.status(500).json({ error: ridersDeleteError.message });
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
      .in(
        "job_id",
        (jobSheetData || []).map((jobSheet) => jobSheet.job_id)
      );
    res.status(500).json({
      error: cleanupError
        ? `${error.message}; additionally failed to remove newly-created job sheets: ${cleanupError.message}`
        : error.message || "Unknown error",
    });
    return;
  }

  res.json({
    message: "Job sheets dispatched successfully",
    data: { jobStops: data, jobSheets: jobSheetData },
  });
});