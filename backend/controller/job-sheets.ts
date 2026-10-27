import express from "express";
import { dbconnect, execute, queryRows } from "../dbconnect";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";

export const router = express.Router();

type OrderRow = RowDataPacket & {
  order_id: number;
  customer_id: number;
  qty: number;
  delivery_fee: number | string;
};

type CustomerRow = RowDataPacket & {
  customer_id: number;
  name: string;
  phone: string;
  latitude: number | string;
  longitude: number | string;
};

type MappedCustomer = {
  customer_id: number;
  name: string;
  phone: string;
  latitude: number;
  longitude: number;
};

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
  "รูปแบบที่ 1: คุ้มสุด กำไรเน้นๆ (รวมออเดอร์ทางเดียวกัน ประหยัดไรเดอร์และค่าน้ำมัน)",
  "รูปแบบที่ 2: ส่งด่วน ทันใจลูกค้า (กระจายงานช่วยกันวิ่ง ถึงไวทุกบ้าน)",
];
const ALGO_COUNT = ALGO_NAMES.length;

type DistanceSource = "osrm" | "fallback" | "none";
const DEADLINE_MIN = 12 * 60 + 30;
const START_MIN = 11 * 60 + 30;

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

  if (coords.length > OSRM_MAX_COORDS) {
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

function calcRouteDistance(route: number[], roadMatrix: number[][]): number {
  let dist = 0;
  let curr = 0;
  for (const node of route) {
    dist += roadMatrix[curr]![node]!;
    curr = node;
  }
  return dist;
}

function calcRouteDuration(route: number[], roadMatrix: number[][]): number {
  return (
    (calcRouteDistance(route, roadMatrix) / ROUTE_CONFIG.SPEED_KMH) * 60 +
    route.length * ROUTE_CONFIG.TIME_PER_STOP_MIN
  );
}

function getPermutations(arr: number[]): number[][] {
  return arr.length <= 1
    ? [arr]
    : arr.flatMap((x, i) =>
        getPermutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [
          x,
          ...p,
        ])
      );
}

function optimizeStopsOrder(route: number[], roadMatrix: number[][]): number[] {
  if (route.length <= 1) return route;
  let best = route;
  let bestDist = calcRouteDistance(route, roadMatrix);
  for (const p of getPermutations(route)) {
    const d = calcRouteDistance(p, roadMatrix);
    if (d < bestDist - 1e-9) {
      best = p;
      bestDist = d;
    }
  }
  return best;
}

// โหมดที่ 1: กำไรสูงสุด (Max Profit)
function runMaxProfitRoad(
  orders: RouteOrder[],
  roadMatrix: number[][]
): number[][] {
  const n = orders.length;
  let routes: number[][] = Array.from({ length: n }, (_, i) => [i + 1]);

  const savings: { i: number; j: number; s: number }[] = [];
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= n; j++) {
      if (i !== j) {
        const s = roadMatrix[0]![i]! + roadMatrix[0]![j]! - roadMatrix[i]![j]!;
        if (Number.isFinite(s)) savings.push({ i, j, s });
      }
    }
  }
  savings.sort((a, b) => b.s - a.s);

  for (const { i, j } of savings) {
    const rI = routes.findIndex((r) => r[r.length - 1] === i);
    const rJ = routes.findIndex((r) => r[0] === j);

    if (rI !== -1 && rJ !== -1 && rI !== rJ) {
      const merged = optimizeStopsOrder(
        [...routes[rI]!, ...routes[rJ]!],
        roadMatrix
      );
      if (
        merged.length <= ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE &&
        calcRouteDuration(merged, roadMatrix) <= ROUTE_CONFIG.MAX_DELIVERY_MIN
      ) {
        routes[rI] = merged;
        routes.splice(rJ, 1);
      }
    }
  }

  const boxesOf = (node: number) => orders[node - 1]!.qty;
  const costOf = (route: number[]): number => {
    if (route.length === 0) return 0;
    const boxes = route.reduce((sum, node) => sum + boxesOf(node), 0);
    return (
      ROUTE_CONFIG.RIDER_BASE_FEE +
      calcRouteDistance(route, roadMatrix) *
        boxes *
        ROUTE_CONFIG.FUEL_RATE_PER_KM_BOX
    );
  };

  routes = routes.map((r) => optimizeStopsOrder(r, roadMatrix));

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

        if (rb.length < ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE) {
          for (let i = 0; i < ra.length && !improved; i++) {
            const newA = optimizeStopsOrder(
              ra.filter((_, k) => k !== i),
              roadMatrix
            );
            const newB = optimizeStopsOrder([...rb, ra[i]!], roadMatrix);
            if (
              calcRouteDuration(newB, roadMatrix) >
              ROUTE_CONFIG.MAX_DELIVERY_MIN
            )
              continue;
            if (costOf(newA) + costOf(newB) < before - 1e-6) {
              routes[a] = newA;
              routes[b] = newB;
              improved = true;
            }
          }
        }

        if (a < b) {
          for (let i = 0; i < ra.length && !improved; i++) {
            for (let j = 0; j < rb.length && !improved; j++) {
              const newA = optimizeStopsOrder(
                ra.map((node, k) => (k === i ? rb[j]! : node)),
                roadMatrix
              );
              const newB = optimizeStopsOrder(
                rb.map((node, k) => (k === j ? ra[i]! : node)),
                roadMatrix
              );
              if (
                calcRouteDuration(newA, roadMatrix) >
                  ROUTE_CONFIG.MAX_DELIVERY_MIN ||
                calcRouteDuration(newB, roadMatrix) >
                  ROUTE_CONFIG.MAX_DELIVERY_MIN
              )
                continue;
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

// โหมดที่ 2: ส่งเร็วที่สุด (Fastest Delivery)
function runFastestDeliveryRoad(
  orders: RouteOrder[],
  roadMatrix: number[][]
): number[][] {
  const n = orders.length;
  const targetRiders = Math.min(n, Math.max(1, Math.ceil(n / 2)));

  const sortedByAngle = orders
    .map((o, idx) => ({
      node: idx + 1,
      angle: Math.atan2(
        o.customer.latitude - MSU_CENTER[0],
        o.customer.longitude - MSU_CENTER[1]
      ),
    }))
    .sort((a, b) => a.angle - b.angle)
    .map((item) => item.node);

  const routes: number[][] = [];
  const assigned = new Set<number>();

  const step = Math.max(1, Math.floor(sortedByAngle.length / targetRiders));
  for (let i = 0; i < sortedByAngle.length && routes.length < targetRiders; i += step) {
    const seedNode = sortedByAngle[i]!;
    routes.push([seedNode]);
    assigned.add(seedNode);
  }

  const remaining = sortedByAngle.filter((node) => !assigned.has(node));

  while (remaining.length > 0) {
    let bestRemIdx = -1;
    let bestRouteIdx = -1;
    let bestNewDuration = Infinity;

    for (let rIdx = 0; rIdx < routes.length; rIdx++) {
      const route = routes[rIdx]!;
      if (route.length >= ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE) continue;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i]!;
        const trialRoute = optimizeStopsOrder([...route, candidate], roadMatrix);
        const newDur = calcRouteDuration(trialRoute, roadMatrix);

        if (
          newDur <= ROUTE_CONFIG.MAX_DELIVERY_MIN &&
          newDur < bestNewDuration
        ) {
          bestNewDuration = newDur;
          bestRemIdx = i;
          bestRouteIdx = rIdx;
        }
      }
    }

    if (bestRemIdx !== -1 && bestRouteIdx !== -1) {
      const [picked] = remaining.splice(bestRemIdx, 1);
      routes[bestRouteIdx] = optimizeStopsOrder(
        [...routes[bestRouteIdx]!, picked!],
        roadMatrix
      );
    } else {
      const [picked] = remaining.splice(0, 1);
      if (picked !== undefined) routes.push([picked]);
    }
  }

  let improved = true;
  let guard = 0;
  while (improved && guard++ < 200) {
    improved = false;

    for (let a = 0; a < routes.length && !improved; a++) {
      for (let b = 0; b < routes.length && !improved; b++) {
        if (a === b) continue;
        const ra = routes[a]!;
        const rb = routes[b]!;
        const durA = calcRouteDuration(ra, roadMatrix);
        const durB = calcRouteDuration(rb, roadMatrix);
        const prevMax = Math.max(durA, durB);
        const prevSum = durA + durB;

        if (rb.length < ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE && ra.length > 1) {
          for (let i = 0; i < ra.length && !improved; i++) {
            const newA = optimizeStopsOrder(
              ra.filter((_, k) => k !== i),
              roadMatrix
            );
            const newB = optimizeStopsOrder([...rb, ra[i]!], roadMatrix);
            const newDurA = calcRouteDuration(newA, roadMatrix);
            const newDurB = calcRouteDuration(newB, roadMatrix);

            if (newDurB > ROUTE_CONFIG.MAX_DELIVERY_MIN) continue;

            const newMax = Math.max(newDurA, newDurB);
            const newSum = newDurA + newDurB;

            if (
              newMax < prevMax - 1e-6 ||
              (Math.abs(newMax - prevMax) <= 1e-6 && newSum < prevSum - 1e-6)
            ) {
              routes[a] = newA;
              routes[b] = newB;
              improved = true;
            }
          }
        }

        if (a < b) {
          for (let i = 0; i < ra.length && !improved; i++) {
            for (let j = 0; j < rb.length && !improved; j++) {
              const newA = optimizeStopsOrder(
                ra.map((node, k) => (k === i ? rb[j]! : node)),
                roadMatrix
              );
              const newB = optimizeStopsOrder(
                rb.map((node, k) => (k === j ? ra[i]! : node)),
                roadMatrix
              );
              const newDurA = calcRouteDuration(newA, roadMatrix);
              const newDurB = calcRouteDuration(newB, roadMatrix);

              if (
                newDurA > ROUTE_CONFIG.MAX_DELIVERY_MIN ||
                newDurB > ROUTE_CONFIG.MAX_DELIVERY_MIN
              )
                continue;

              const newMax = Math.max(newDurA, newDurB);
              const newSum = newDurA + newDurB;

              if (
                newMax < prevMax - 1e-6 ||
                (Math.abs(newMax - prevMax) <= 1e-6 && newSum < prevSum - 1e-6)
              ) {
                routes[a] = newA;
                routes[b] = newB;
                improved = true;
              }
            }
          }
        }
      }
    }
  }

  return routes.filter((r) => r.length > 0);
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

  const { matrix: roadMatrix, source: distanceSource } =
    await fetchRoadDistanceMatrix(orders);

  const routeGroups: number[][] =
    algoIndex === 0
      ? runMaxProfitRoad(orders, roadMatrix)
      : runFastestDeliveryRoad(orders, roadMatrix);

  const jobSheets: RouteJobSheet[] = routeGroups.map(
    (routeNodeIndices, riderIndex) => {
      let currentLocNode = 0;
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

  const [sheet] = await queryRows(
    "SELECT job_id, job_code, distance_km, duration_min, rider_pay FROM job_sheets WHERE job_code = ? LIMIT 1",
    [jobCode]
  );

  if (!sheet) {
    res.status(404).json({ error: "Job sheet not found" });
    return;
  }

  const stops = await queryRows(
    "SELECT order_id, stop_seq, distance_km FROM job_stops WHERE job_id = ? ORDER BY stop_seq ASC",
    [sheet.job_id]
  );

  const jobStops = stops ?? [];
  const orderIds = jobStops.map((stop) => stop.order_id);

  let orders: { order_id: number; customer_id: number; qty: number }[] = [];
  let customers: {
    customer_id: number;
    name: string;
    phone: string;
    latitude: number | string;
    longitude: number | string;
  }[] = [];

  if (orderIds.length > 0) {
    const placeholders = orderIds.map(() => "?").join(", ");
    orders = await queryRows<OrderRow>(
      `SELECT order_id, customer_id, qty FROM orders WHERE order_id IN (${placeholders})`,
      orderIds
    );

    const customerIds = [...new Set(orders.map((order) => order.customer_id))];

    if (customerIds.length > 0) {
      const custPlaceholders = customerIds.map(() => "?").join(", ");
      customers = await queryRows<CustomerRow>(
        `SELECT customer_id, name, phone, latitude, longitude FROM customers WHERE customer_id IN (${custPlaceholders})`,
        customerIds
      );
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

    const orders = await queryRows<OrderRow>(
      "SELECT order_id, customer_id, delivery_fee, qty FROM orders"
    );
    const customerIds = [...new Set(orders.map((order) => order.customer_id))];
    let customerById = new Map<number, MappedCustomer>();

    if (customerIds.length > 0) {
      customerById = new Map(
        (
          await queryRows<CustomerRow>(
            `SELECT customer_id, name, phone, latitude, longitude FROM customers WHERE customer_id IN (${customerIds
              .map(() => "?")
              .join(", ")})`,
            customerIds
          )
        ).map((customer) => [
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

  const data = await queryRows(
    "SELECT order_id FROM job_stops WHERE order_id = ?",
    [orderId]
  );
  await execute("DELETE FROM job_stops WHERE order_id = ?", [orderId]);
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

  const connection = await dbconnect.getConnection();
  const riderData: { rider_id: number; rider_code: string }[] = [];
  const jobSheetData: { job_id: number; job_code: string }[] = [];
  const data: {
    job_id: number;
    order_id: number;
    stop_seq: number;
    distance_km: number;
  }[] = [];

  try {
    await connection.beginTransaction();
    await connection.execute("DELETE FROM job_stops");
    await connection.execute("DELETE FROM job_sheets");
    await connection.execute("DELETE FROM riders");

    for (const rider of riders) {
      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO riders (rider_code, route_color, max_orders) VALUES (?, ?, ?)",
        [rider.rider_code, rider.route_color, rider.max_orders ?? 3]
      );
      riderData.push({
        rider_id: result.insertId,
        rider_code: rider.rider_code,
      });
    }

    const riderIdsByCode = new Map(
      riderData.map((rider) => [rider.rider_code, rider.rider_id])
    );
    const jobIdsByCode = new Map<string, number>();

    for (const jobSheet of jobSheets) {
      const riderId = riderIdsByCode.get(jobSheet.rider.rider_code);
      if (riderId === undefined) {
        res
          .status(400)
          .json({ error: "A job sheet references an unknown rider" });
        await connection.rollback();
        return;
      }

      const [result] = await connection.execute<ResultSetHeader>(
        "INSERT INTO job_sheets (job_code, rider_id, distance_km, duration_min, rider_pay) VALUES (?, ?, ?, ?, ?)",
        [
          jobSheet.job_code,
          riderId,
          jobSheet.distance_km,
          jobSheet.duration_min,
          jobSheet.rider_pay,
        ]
      );
      const insertedSheet = {
        job_id: result.insertId,
        job_code: jobSheet.job_code,
      };
      jobSheetData.push(insertedSheet);
      jobIdsByCode.set(jobSheet.job_code, result.insertId);
    }

    for (const jobSheet of jobSheets) {
      const jobId = jobIdsByCode.get(jobSheet.job_code);
      if (jobId === undefined) {
        throw new Error(`Missing inserted job sheet for ${jobSheet.job_code}`);
      }

      for (const stop of jobSheet.stops) {
        await connection.execute(
          "INSERT INTO job_stops (job_id, order_id, stop_seq, distance_km) VALUES (?, ?, ?, ?)",
          [jobId, stop.order_id, stop.stop_seq, stop.distance_km]
        );
        data.push({
          job_id: jobId,
          order_id: stop.order_id,
          stop_seq: stop.stop_seq,
          distance_km: stop.distance_km,
        });
      }
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  res.json({
    message: "Job sheets dispatched successfully",
    data: { jobStops: data, jobSheets: jobSheetData },
  });
});