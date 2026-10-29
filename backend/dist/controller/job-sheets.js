"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const dbconnect_1 = require("../dbconnect");
exports.router = express_1.default.Router();
// express 4 ไม่จับ error ของ async handler ให้เอง ใช้ตัวห่อนี้เพื่อตอบ 500 แทนที่ request จะค้าง
const safe = (fn) => (req, res) => {
    Promise.resolve(fn(req, res)).catch((err) => {
        console.error("job-sheets route error:", err);
        if (!res.headersSent) {
            res.status(500).json({ error: err?.message || "Internal server error" });
        }
    });
};
const MSU_CENTER = [16.2466557, 103.2517639];
const MAX_SERVICE_RADIUS_KM = 3.0; // เงื่อนไขข้อ 3: รัศมีให้บริการไม่เกิน 3 กม.
const OSRM_TIMEOUT_MS = 8000;
const OSRM_MAX_COORDS = 100;
const EXACT_MAX_ORDERS = 16; // ไม่เกินนี้จะหาคำตอบต้นทุนต่ำสุดแบบแน่นอน (DP)
const FAST_MODE_MAX_STOPS = 2; // โหมดส่งด่วน: สายละไม่เกิน 2 ออเดอร์
// นาทีที่ยอมผ่อนเพดานเวลาโหมดส่งด่วน (0 = เร็วสุดเท่าที่เป็นไปได้ ไม่มีวันช้ากว่าโหมดกำไรสูงสุด)
const FAST_MODE_SLACK_MIN = 0;
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
const DEADLINE_MIN = 12 * 60 + 30;
const START_MIN = 11 * 60 + 30;
function haversine(lat1, lon1, lat2, lon2) {
    const earthRadiusKm = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
/**
 * ดึงตารางระยะทางตามถนนจริงจาก OSRM Table API (Index 0 = ร้านค้า, 1..N = ลูกค้า)
 * มี timeout, ตรวจ response และใช้ค่าประมาณ (Haversine x 1.3) เมื่อ OSRM ใช้ไม่ได้
 */
async function fetchRoadDistanceMatrix(orders) {
    const coords = [
        MSU_CENTER,
        ...orders.map((o) => [o.customer.latitude, o.customer.longitude]),
    ];
    const estimated = () => coords.map((from) => coords.map((to) => haversine(from[0], from[1], to[0], to[1]) * 1.3));
    if (coords.length > OSRM_MAX_COORDS) {
        return { matrix: estimated(), source: "fallback" };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);
    try {
        const coordString = coords.map((pt) => `${pt[1]},${pt[0]}`).join(";");
        const url = `https://router.project-osrm.org/table/v1/driving/${coordString}?annotations=distance`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok)
            throw new Error(`OSRM HTTP ${res.status}`);
        const data = await res.json();
        if (data?.code !== "Ok" || !Array.isArray(data.distances)) {
            throw new Error(`OSRM response code: ${data?.code}`);
        }
        const est = estimated();
        const matrix = data.distances.map((row, i) => row.map((distMeters, j) => distMeters == null || !Number.isFinite(distMeters)
            ? est[i][j]
            : distMeters / 1000));
        return { matrix, source: "osrm" };
    }
    catch (err) {
        console.warn("OSRM Table API failed, using estimated road factor:", err);
        return { matrix: estimated(), source: "fallback" };
    }
    finally {
        clearTimeout(timer);
    }
}
function routeColor(index) {
    const hue = (index * 137.508) % 360;
    const saturation = 75 + (index % 3) * 7;
    const lightness = 40 + (index % 2) * 8;
    const k = (n) => (n + hue / 30) % 12;
    const a = (saturation / 100) * Math.min(lightness / 100, 1 - lightness / 100);
    const channel = (n) => {
        const value = lightness / 100 -
            a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return Math.round(value * 255)
            .toString(16)
            .padStart(2, "0");
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}
function getOrdersSignature(orders) {
    return orders
        .map((order) => `${order.order_id}:${order.qty}:${order.customer.latitude}:${order.customer.longitude}`)
        .sort()
        .join("|");
}
function calcRouteDistance(route, roadMatrix) {
    let dist = 0;
    let curr = 0;
    for (const node of route) {
        dist += roadMatrix[curr][node];
        curr = node;
    }
    return dist;
}
function calcRouteDuration(route, roadMatrix) {
    return ((calcRouteDistance(route, roadMatrix) / ROUTE_CONFIG.SPEED_KMH) * 60 +
        route.length * ROUTE_CONFIG.TIME_PER_STOP_MIN);
}
function getPermutations(arr) {
    return arr.length <= 1
        ? [arr]
        : arr.flatMap((x, i) => getPermutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [
            x,
            ...p,
        ]));
}
// ลำดับจุดที่ระยะสั้นสุดภายในสาย (ไล่ทุกลำดับ ปลอดภัยเมื่อสายละไม่เกิน ~6 จุด)
function optimizeStopsOrder(route, roadMatrix) {
    if (route.length <= 1)
        return route;
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
// ต้นทุนส่งของสาย: ปัดระยะ 2 ตำแหน่งให้ตรงกับที่ใช้ตอนสร้างใบงานและ summary
function calcExactRouteCost(route, orders, roadMatrix) {
    if (route.length === 0)
        return 0;
    let curr = 0;
    let rawDist = 0;
    let boxes = 0;
    for (const node of route) {
        rawDist += roadMatrix[curr][node];
        boxes += orders[node - 1].qty;
        curr = node;
    }
    const roundedDist = Math.round(rawDist * 100) / 100;
    return (ROUTE_CONFIG.RIDER_BASE_FEE +
        roundedDist * boxes * ROUTE_CONFIG.FUEL_RATE_PER_KM_BOX);
}
function calcTotalSystemCost(routes, orders, roadMatrix) {
    return routes.reduce((sum, r) => sum + calcExactRouteCost(r, orders, roadMatrix), 0);
}
// ปรับปรุงสายส่งด้วย Local Search (Relocate + Swap + Split) เพื่อบีบต้นทุนบาทให้ต่ำสุด
function polishRoutesForMinCost(initialRoutes, orders, roadMatrix) {
    let routes = initialRoutes
        .filter((r) => r.length > 0)
        .map((r) => optimizeStopsOrder(r, roadMatrix));
    let improved = true;
    let guard = 0;
    while (improved && guard++ < 250) {
        improved = false;
        // 1. Relocate & Swap ระหว่างสายที่มีอยู่
        for (let a = 0; a < routes.length && !improved; a++) {
            for (let b = 0; b < routes.length && !improved; b++) {
                if (a === b)
                    continue;
                const ra = routes[a];
                const rb = routes[b];
                const before = calcExactRouteCost(ra, orders, roadMatrix) +
                    calcExactRouteCost(rb, orders, roadMatrix);
                // Relocate: ย้ายจุด i จากสาย a ไปสาย b
                if (rb.length < ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE) {
                    for (let i = 0; i < ra.length && !improved; i++) {
                        const newA = optimizeStopsOrder(ra.filter((_, k) => k !== i), roadMatrix);
                        const newB = optimizeStopsOrder([...rb, ra[i]], roadMatrix);
                        if (calcRouteDuration(newB, roadMatrix) >
                            ROUTE_CONFIG.MAX_DELIVERY_MIN)
                            continue;
                        const after = calcExactRouteCost(newA, orders, roadMatrix) +
                            calcExactRouteCost(newB, orders, roadMatrix);
                        if (after < before - 1e-6) {
                            routes[a] = newA;
                            routes[b] = newB;
                            improved = true;
                        }
                    }
                }
                // Swap: สลับจุด i ของสาย a กับจุด j ของสาย b
                if (a < b) {
                    for (let i = 0; i < ra.length && !improved; i++) {
                        for (let j = 0; j < rb.length && !improved; j++) {
                            const newA = optimizeStopsOrder(ra.map((node, k) => (k === i ? rb[j] : node)), roadMatrix);
                            const newB = optimizeStopsOrder(rb.map((node, k) => (k === j ? ra[i] : node)), roadMatrix);
                            if (calcRouteDuration(newA, roadMatrix) >
                                ROUTE_CONFIG.MAX_DELIVERY_MIN ||
                                calcRouteDuration(newB, roadMatrix) >
                                    ROUTE_CONFIG.MAX_DELIVERY_MIN)
                                continue;
                            const after = calcExactRouteCost(newA, orders, roadMatrix) +
                                calcExactRouteCost(newB, orders, roadMatrix);
                            if (after < before - 1e-6) {
                                routes[a] = newA;
                                routes[b] = newB;
                                improved = true;
                            }
                        }
                    }
                }
            }
        }
        // 2. Split: ทดลองแยกจุดส่งออกจากสายที่แบกกล่องเยอะเกินไป มาเปิดสายเดี่ยวใหม่
        if (!improved) {
            for (let a = 0; a < routes.length && !improved; a++) {
                const ra = routes[a];
                if (ra.length <= 1)
                    continue;
                const before = calcExactRouteCost(ra, orders, roadMatrix);
                for (let i = 0; i < ra.length && !improved; i++) {
                    const reducedA = optimizeStopsOrder(ra.filter((_, k) => k !== i), roadMatrix);
                    const soloRoute = [ra[i]];
                    const after = calcExactRouteCost(reducedA, orders, roadMatrix) +
                        calcExactRouteCost(soloRoute, orders, roadMatrix);
                    if (after < before - 1e-6) {
                        routes[a] = reducedA;
                        routes.push(soloRoute);
                        improved = true;
                    }
                }
            }
        }
        routes = routes.filter((r) => r.length > 0);
    }
    return routes;
}
/**
 * หาการแบ่งสายที่ "ต้นทุนรวมต่ำสุดจริง" ด้วย DP บน bitmask (ไม่ใช่ heuristic)
 * - maxStops: จำนวนออเดอร์สูงสุดต่อสาย (1-3)
 * - maxMinutes: เวลาสูงสุดของสายที่มี 2 ออเดอร์ขึ้นไป
 *   (สายเดี่ยวอนุญาตเสมอ เพราะทุกออเดอร์ต้องมีคนส่ง)
 * คืน null เมื่อออเดอร์เกิน EXACT_MAX_ORDERS (ให้ผู้เรียกใช้วิธีประมาณแทน)
 */
function solveMinCostPartition(orders, roadMatrix, maxStops, maxMinutes) {
    const n = orders.length;
    if (n === 0 || n > EXACT_MAX_ORDERS)
        return null;
    const groupsByLow = Array.from({ length: n }, () => []);
    const consider = (nodes) => {
        const route = optimizeStopsOrder(nodes, roadMatrix);
        if (route.length > 1 &&
            calcRouteDuration(route, roadMatrix) > maxMinutes + 1e-6) {
            return;
        }
        let mask = 0;
        for (const x of nodes)
            mask |= 1 << (x - 1);
        groupsByLow[Math.min(...nodes) - 1].push({
            mask,
            route,
            cost: calcExactRouteCost(route, orders, roadMatrix),
        });
    };
    for (let i = 1; i <= n; i++) {
        consider([i]);
        if (maxStops < 2)
            continue;
        for (let j = i + 1; j <= n; j++) {
            consider([i, j]);
            if (maxStops < 3)
                continue;
            for (let k = j + 1; k <= n; k++)
                consider([i, j, k]);
        }
    }
    const full = (1 << n) - 1;
    const dp = new Float64Array(full + 1).fill(Infinity);
    const pick = new Array(full + 1).fill(null);
    dp[0] = 0;
    for (let mask = 0; mask < full; mask++) {
        if (!Number.isFinite(dp[mask]))
            continue;
        let low = 0;
        while (mask & (1 << low))
            low++;
        for (const g of groupsByLow[low]) {
            if (g.mask & mask)
                continue;
            const nm = mask | g.mask;
            const c = dp[mask] + g.cost;
            if (c < dp[nm]) {
                dp[nm] = c;
                pick[nm] = g;
            }
        }
    }
    if (!Number.isFinite(dp[full]))
        return null;
    const routes = [];
    for (let m = full; m;) {
        const g = pick[m];
        routes.push(g.route);
        m ^= g.mask;
    }
    // เรียงให้ผลคงที่: สายที่มีออเดอร์เลขน้อยสุดมาก่อน
    routes.sort((a, b) => Math.min(...a) - Math.min(...b));
    return routes;
}
// โหมดกำไรสูงสุด: หาต้นทุนต่ำสุดจริง (สายละไม่เกิน 3 ออเดอร์, ไม่เกิน 60 นาที)
function solveExactMinCost(orders, roadMatrix) {
    if (ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE !== 3)
        return null;
    return solveMinCostPartition(orders, roadMatrix, 3, ROUTE_CONFIG.MAX_DELIVERY_MIN);
}
/**
 * โหมดที่ 2: ส่งด่วน — "เร็วที่สุดก่อน แล้วค่อยประหยัด"
 * 1) เพดานเวลา T = เวลาของลูกค้าที่ไกลที่สุดเมื่อส่งเดี่ยว (ต่ำสุดที่เป็นไปได้)
 *    ไม่มีการแบ่งสายแบบใดทำให้ระบบเสร็จเร็วกว่า T
 * 2) รวมสายได้ (สายละไม่เกิน FAST_MODE_MAX_STOPS) เฉพาะเมื่อสายที่รวมใช้เวลาไม่เกิน T
 *    และเลือกชุดที่ต้นทุนรวมต่ำสุด
 *    - ออเดอร์ไม่เกิน EXACT_MAX_ORDERS: หาชุดที่ดีที่สุดจริงด้วย DP
 *    - มากกว่านั้น: จับคู่แบบ greedy ตามเงินที่ประหยัดได้ (ไม่การันตีต่ำสุด แต่ไม่เกิน T)
 */
function runFastestDeliveryRoad(orders, roadMatrix) {
    const n = orders.length;
    if (n === 0)
        return [];
    let ceiling = 0;
    for (let i = 1; i <= n; i++) {
        ceiling = Math.max(ceiling, calcRouteDuration([i], roadMatrix));
    }
    const limit = ceiling + FAST_MODE_SLACK_MIN + 1e-6;
    const exact = solveMinCostPartition(orders, roadMatrix, FAST_MODE_MAX_STOPS, limit);
    if (exact)
        return exact;
    // ออเดอร์เยอะ: จับคู่แบบ greedy
    const pairs = [];
    for (let i = 1; i <= n; i++) {
        for (let j = i + 1; j <= n; j++) {
            const route = optimizeStopsOrder([i, j], roadMatrix);
            if (calcRouteDuration(route, roadMatrix) > limit)
                continue;
            const gain = calcExactRouteCost([i], orders, roadMatrix) +
                calcExactRouteCost([j], orders, roadMatrix) -
                calcExactRouteCost(route, orders, roadMatrix);
            if (gain > 1e-6)
                pairs.push({ i, j, gain, route });
        }
    }
    pairs.sort((a, b) => b.gain - a.gain);
    const used = new Set();
    const routes = [];
    for (const p of pairs) {
        if (used.has(p.i) || used.has(p.j))
            continue;
        used.add(p.i);
        used.add(p.j);
        routes.push(p.route);
    }
    for (let i = 1; i <= n; i++) {
        if (!used.has(i))
            routes.push([i]);
    }
    routes.sort((a, b) => Math.min(...a) - Math.min(...b));
    return routes;
}
/**
 * โหมดที่ 1: กำไรสูงสุด (Max Profit)
 * - ออเดอร์ไม่เกิน EXACT_MAX_ORDERS: หาการแบ่งสายต้นทุนต่ำสุดจริงด้วย DP
 * - มากกว่านั้น: เปรียบเทียบ heuristic 3 แบบ แล้วเลือกต้นทุนต่ำสุด
 *   (A: Cost-Based Savings, B: Clarke-Wright, C: ผลของโหมดส่งด่วน แล้ว Polish)
 *   ทำให้ผลไม่แพ้โหมดส่งเร็วในแง่ต้นทุนส่ง แต่ไม่ใช่การันตีว่าต่ำสุดจริง
 */
function runMaxProfitRoad(orders, roadMatrix) {
    const exact = solveExactMinCost(orders, roadMatrix);
    if (exact)
        return exact;
    const n = orders.length;
    // ทางเลือกที่ 1: Cost-Based Savings (ยุบรวมเฉพาะคู่ที่ทำให้ต้นทุนเงินบาทจริงลดลง)
    let routesA = Array.from({ length: n }, (_, i) => [i + 1]);
    let mergedAny = true;
    while (mergedAny) {
        mergedAny = false;
        let bestGain = 0;
        let bestPair = null;
        let bestMergedRoute = [];
        for (let i = 0; i < routesA.length; i++) {
            for (let j = i + 1; j < routesA.length; j++) {
                const r1 = routesA[i];
                const r2 = routesA[j];
                if (r1.length + r2.length > ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE)
                    continue;
                const candidate = optimizeStopsOrder([...r1, ...r2], roadMatrix);
                if (calcRouteDuration(candidate, roadMatrix) >
                    ROUTE_CONFIG.MAX_DELIVERY_MIN)
                    continue;
                const separateCost = calcExactRouteCost(r1, orders, roadMatrix) +
                    calcExactRouteCost(r2, orders, roadMatrix);
                const mergedCost = calcExactRouteCost(candidate, orders, roadMatrix);
                const costSaved = separateCost - mergedCost;
                if (costSaved > bestGain + 1e-6) {
                    bestGain = costSaved;
                    bestPair = [i, j];
                    bestMergedRoute = candidate;
                }
            }
        }
        if (bestPair) {
            const [i, j] = bestPair;
            routesA[i] = bestMergedRoute;
            routesA.splice(j, 1);
            mergedAny = true;
        }
    }
    routesA = polishRoutesForMinCost(routesA, orders, roadMatrix);
    // ทางเลือกที่ 2: Distance Clarke-Wright + Cost Polish
    let routesB = Array.from({ length: n }, (_, i) => [i + 1]);
    const savings = [];
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= n; j++) {
            if (i !== j) {
                const s = roadMatrix[0][i] + roadMatrix[0][j] - roadMatrix[i][j];
                if (Number.isFinite(s))
                    savings.push({ i, j, s });
            }
        }
    }
    savings.sort((a, b) => b.s - a.s);
    for (const { i, j } of savings) {
        const rI = routesB.findIndex((r) => r[r.length - 1] === i);
        const rJ = routesB.findIndex((r) => r[0] === j);
        if (rI !== -1 && rJ !== -1 && rI !== rJ) {
            const merged = optimizeStopsOrder([...routesB[rI], ...routesB[rJ]], roadMatrix);
            if (merged.length <= ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE &&
                calcRouteDuration(merged, roadMatrix) <= ROUTE_CONFIG.MAX_DELIVERY_MIN) {
                routesB[rI] = merged;
                routesB.splice(rJ, 1);
            }
        }
    }
    routesB = polishRoutesForMinCost(routesB, orders, roadMatrix);
    // ทางเลือกที่ 3: ผลของโหมดส่งด่วน แล้ว Polish ลดต้นทุน
    const routesC = polishRoutesForMinCost(runFastestDeliveryRoad(orders, roadMatrix), orders, roadMatrix);
    const candidates = [routesA, routesB, routesC];
    let bestRoutes = routesA;
    let minCost = calcTotalSystemCost(routesA, orders, roadMatrix);
    for (const cand of candidates) {
        const cost = calcTotalSystemCost(cand, orders, roadMatrix);
        if (cost < minCost - 1e-6) {
            minCost = cost;
            bestRoutes = cand;
        }
    }
    return bestRoutes;
}
async function calculateRoutes(orders, algoIndex) {
    if (orders.length === 0) {
        return {
            jobSheets: [],
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
            distanceSource: "none",
        };
    }
    const { matrix: roadMatrix, source: distanceSource } = await fetchRoadDistanceMatrix(orders);
    const routeGroups = algoIndex === 0
        ? runMaxProfitRoad(orders, roadMatrix)
        : runFastestDeliveryRoad(orders, roadMatrix);
    const jobSheets = routeGroups.map((routeNodeIndices, riderIndex) => {
        let currentLocNode = 0;
        let currentDistance = 0;
        let currentTime = 0;
        let currentBoxes = 0;
        const stops = [];
        routeNodeIndices.forEach((nodeIdx, idx) => {
            const selected = orders[nodeIdx - 1];
            const roadDistKm = roadMatrix[currentLocNode][nodeIdx];
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
            max_orders: algoIndex === 1
                ? FAST_MODE_MAX_STOPS
                : ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE,
        };
        const roundedRouteDist = Math.round(currentDistance * 100) / 100;
        const deliveryCost = ROUTE_CONFIG.RIDER_BASE_FEE +
            roundedRouteDist * currentBoxes * ROUTE_CONFIG.FUEL_RATE_PER_KM_BOX;
        const sales = currentBoxes * ROUTE_CONFIG.PRICE_PER_BOX;
        const foodCost = currentBoxes * ROUTE_CONFIG.FOOD_COST_PER_BOX;
        const netProfit = sales - foodCost - deliveryCost;
        const shortTime = Date.now().toString().slice(-6);
        const randomSuffix = Math.floor(10 + Math.random() * 90);
        const jobCode = `J-${shortTime}-${randomSuffix}-${rider.rider_code}`.slice(0, 20);
        return {
            job_code: jobCode,
            rider_id: rider.rider_id,
            rider,
            distance_km: roundedRouteDist,
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
    });
    const totalOrders = jobSheets.reduce((sum, job) => sum + job.total_orders, 0);
    const totalBoxes = jobSheets.reduce((sum, job) => sum + job.total_boxes, 0);
    const totalDistanceKm = jobSheets.reduce((sum, job) => sum + job.distance_km, 0);
    const maxDurationMin = jobSheets.reduce((max, job) => Math.max(max, job.duration_min), 0);
    const sales = jobSheets.reduce((sum, job) => sum + job.sales, 0);
    const foodCost = jobSheets.reduce((sum, job) => sum + job.food_cost, 0);
    const riderBaseCost = jobSheets.length * ROUTE_CONFIG.RIDER_BASE_FEE;
    const deliveryDistanceCost = jobSheets.reduce((sum, job) => sum +
        job.distance_km * job.total_boxes * ROUTE_CONFIG.FUEL_RATE_PER_KM_BOX, 0);
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
            netProfit: Math.round((sales - foodCost - deliveryDistanceCost - riderBaseCost) * 100) / 100,
            estimatedFinishTime: `${finishHours}:${formattedMinutes} น.`,
            onTime: finishMinutes <= DEADLINE_MIN,
        },
        distanceSource,
    };
}
exports.router.get("/code/:jobCode", safe(async (req, res) => {
    const jobCode = String(req.params.jobCode ?? "")
        .trim()
        .toUpperCase();
    if (!/^[A-Z0-9-]{3,30}$/.test(jobCode)) {
        res.status(400).json({ error: "Invalid job code" });
        return;
    }
    const [sheet] = await (0, dbconnect_1.queryRows)("SELECT job_id, job_code, distance_km, duration_min, rider_pay FROM job_sheets WHERE job_code = ? LIMIT 1", [jobCode]);
    if (!sheet) {
        res.status(404).json({ error: "Job sheet not found" });
        return;
    }
    const stops = await (0, dbconnect_1.queryRows)("SELECT order_id, stop_seq, distance_km FROM job_stops WHERE job_id = ? ORDER BY stop_seq ASC", [sheet.job_id]);
    const jobStops = stops ?? [];
    const orderIds = jobStops.map((stop) => stop.order_id);
    let orders = [];
    let customers = [];
    if (orderIds.length > 0) {
        const placeholders = orderIds.map(() => "?").join(", ");
        orders = await (0, dbconnect_1.queryRows)(`SELECT order_id, customer_id, qty FROM orders WHERE order_id IN (${placeholders})`, orderIds);
        const customerIds = [...new Set(orders.map((order) => order.customer_id))];
        if (customerIds.length > 0) {
            const custPlaceholders = customerIds.map(() => "?").join(", ");
            customers = await (0, dbconnect_1.queryRows)(`SELECT customer_id, name, phone, latitude, longitude FROM customers WHERE customer_id IN (${custPlaceholders})`, customerIds);
        }
    }
    const orderById = new Map(orders.map((order) => [order.order_id, order]));
    const customerById = new Map(customers.map((customer) => [customer.customer_id, customer]));
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
}));
exports.router.post("/calculate", async (req, res) => {
    try {
        const rawAlgo = Number(req.body?.algorithmIndex);
        const algoIndex = Number.isInteger(rawAlgo) && rawAlgo >= 0 ? rawAlgo % ALGO_COUNT : 0;
        const orders = await (0, dbconnect_1.queryRows)("SELECT order_id, customer_id, delivery_fee, qty FROM orders");
        const customerIds = [...new Set(orders.map((order) => order.customer_id))];
        let customerById = new Map();
        if (customerIds.length > 0) {
            customerById = new Map((await (0, dbconnect_1.queryRows)(`SELECT customer_id, name, phone, latitude, longitude FROM customers WHERE customer_id IN (${customerIds
                .map(() => "?")
                .join(", ")})`, customerIds)).map((customer) => [
                customer.customer_id,
                {
                    ...customer,
                    latitude: Number(customer.latitude),
                    longitude: Number(customer.longitude),
                },
            ]));
        }
        const allValidOrders = orders.flatMap((order) => {
            const customer = customerById.get(order.customer_id);
            if (!customer ||
                !Number.isFinite(customer.latitude) ||
                !Number.isFinite(customer.longitude) ||
                customer.latitude === 0 ||
                customer.longitude === 0) {
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
            const distFromShopKm = haversine(MSU_CENTER[0], MSU_CENTER[1], order.customer.latitude, order.customer.longitude);
            return distFromShopKm <= MAX_SERVICE_RADIUS_KM;
        });
        const excludedOutOfRangeCount = allValidOrders.length - inRangeOrders.length;
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
    }
    catch (err) {
        res.status(500).json({ error: err?.message || "Route calculation error" });
    }
});
exports.router.delete("/delete/:id", safe(async (req, res) => {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
        res.status(400).json({ error: "Invalid order ID" });
        return;
    }
    const data = await (0, dbconnect_1.queryRows)("SELECT order_id FROM job_stops WHERE order_id = ?", [orderId]);
    await (0, dbconnect_1.execute)("DELETE FROM job_stops WHERE order_id = ?", [orderId]);
    res.json({ message: "Deleted successfully", data });
}));
exports.router.post("/dispatch", safe(async (req, res) => {
    const { jobSheets, riders } = req.body ?? {};
    if (!Array.isArray(jobSheets) ||
        jobSheets.length === 0 ||
        !Array.isArray(riders) ||
        riders.length === 0 ||
        riders.some((rider) => !rider ||
            typeof rider.rider_code !== "string" ||
            typeof rider.route_color !== "string")) {
        res.status(400).json({ error: "Invalid job sheets or riders data" });
        return;
    }
    const riderCodes = new Set(riders.map((rider) => rider.rider_code));
    if (jobSheets.some((jobSheet) => !jobSheet ||
        typeof jobSheet.job_code !== "string" ||
        !jobSheet.rider ||
        !riderCodes.has(jobSheet.rider.rider_code) ||
        !Array.isArray(jobSheet.stops))) {
        res
            .status(400)
            .json({ error: "Invalid job sheet or unknown rider reference" });
        return;
    }
    const connection = await dbconnect_1.dbconnect.getConnection();
    const riderData = [];
    const jobSheetData = [];
    const data = [];
    try {
        await connection.beginTransaction();
        await connection.execute("DELETE FROM job_stops");
        await connection.execute("DELETE FROM job_sheets");
        await connection.execute("DELETE FROM riders");
        for (const rider of riders) {
            const [result] = await connection.execute("INSERT INTO riders (rider_code, route_color, max_orders) VALUES (?, ?, ?)", [rider.rider_code, rider.route_color, rider.max_orders ?? 3]);
            riderData.push({
                rider_id: result.insertId,
                rider_code: rider.rider_code,
            });
        }
        const riderIdsByCode = new Map(riderData.map((rider) => [rider.rider_code, rider.rider_id]));
        const jobIdsByCode = new Map();
        for (const jobSheet of jobSheets) {
            const riderId = riderIdsByCode.get(jobSheet.rider.rider_code);
            if (riderId === undefined) {
                await connection.rollback();
                res
                    .status(400)
                    .json({ error: "A job sheet references an unknown rider" });
                return;
            }
            const [result] = await connection.execute("INSERT INTO job_sheets (job_code, rider_id, distance_km, duration_min, rider_pay) VALUES (?, ?, ?, ?, ?)", [
                jobSheet.job_code,
                riderId,
                jobSheet.distance_km,
                jobSheet.duration_min,
                jobSheet.rider_pay,
            ]);
            jobSheetData.push({
                job_id: result.insertId,
                job_code: jobSheet.job_code,
            });
            jobIdsByCode.set(jobSheet.job_code, result.insertId);
        }
        for (const jobSheet of jobSheets) {
            const jobId = jobIdsByCode.get(jobSheet.job_code);
            if (jobId === undefined) {
                throw new Error(`Missing inserted job sheet for ${jobSheet.job_code}`);
            }
            for (const stop of jobSheet.stops) {
                await connection.execute("INSERT INTO job_stops (job_id, order_id, stop_seq, distance_km) VALUES (?, ?, ?, ?)", [jobId, stop.order_id, stop.stop_seq, stop.distance_km]);
                data.push({
                    job_id: jobId,
                    order_id: stop.order_id,
                    stop_seq: stop.stop_seq,
                    distance_km: stop.distance_km,
                });
            }
        }
        await connection.commit();
    }
    catch (error) {
        await connection.rollback();
        throw error; // ถูกจับโดย safe() แล้วตอบ 500
    }
    finally {
        connection.release();
    }
    res.json({
        message: "Job sheets dispatched successfully",
        data: { jobStops: data, jobSheets: jobSheetData },
    });
}));
//# sourceMappingURL=job-sheets.js.map