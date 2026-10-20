"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const dbconnect_1 = require("../dbconnect");
exports.router = express_1.default.Router();
const MSU_CENTER = [16.2466557, 103.2517639];
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
function haversine(lat1, lon1, lat2, lon2) {
    const earthRadiusKm = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
function routeColor(index) {
    const hue = (index * 137.508) % 360;
    const saturation = 75 + (index % 3) * 7;
    const lightness = 40 + (index % 2) * 8;
    const k = (n) => (n + hue / 30) % 12;
    const a = (saturation / 100) * Math.min(lightness / 100, 1 - lightness / 100);
    const channel = (n) => {
        const value = lightness / 100 - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
        return Math.round(value * 255).toString(16).padStart(2, "0");
    };
    return `#${channel(0)}${channel(8)}${channel(4)}`.toUpperCase();
}
function getOrdersSignature(orders) {
    return orders
        .map((order) => `${order.order_id}:${order.qty}:${order.customer.latitude}:${order.customer.longitude}`)
        .sort()
        .join("|");
}
function calculateRoutes(orders) {
    const ordersWithAngle = orders
        .map((order) => ({
        order,
        angle: Math.atan2(order.customer.latitude - MSU_CENTER[0], order.customer.longitude - MSU_CENTER[1]),
    }))
        .sort((a, b) => a.angle - b.angle);
    const sortedOrders = ordersWithAngle.map(({ order }) => order);
    const jobSheets = [];
    let riderIndex = 0;
    while (sortedOrders.length > 0) {
        let currentLatitude = MSU_CENTER[0];
        let currentLongitude = MSU_CENTER[1];
        let currentDistance = 0;
        let currentTime = 0;
        let currentBoxes = 0;
        const stops = [];
        while (stops.length < ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE &&
            sortedOrders.length > 0) {
            let nearestIndex = -1;
            let shortestDistance = Infinity;
            let travelTime = 0;
            for (let i = 0; i < sortedOrders.length; i++) {
                const candidate = sortedOrders[i];
                if (!candidate)
                    continue;
                const distance = haversine(currentLatitude, currentLongitude, candidate.customer.latitude, candidate.customer.longitude);
                const candidateTravelTime = (distance / ROUTE_CONFIG.SPEED_KMH) * 60;
                if (currentTime + candidateTravelTime + ROUTE_CONFIG.TIME_PER_STOP_MIN <=
                    ROUTE_CONFIG.MAX_DELIVERY_MIN &&
                    distance < shortestDistance) {
                    shortestDistance = distance;
                    nearestIndex = i;
                    travelTime = candidateTravelTime;
                }
            }
            if (nearestIndex === -1) {
                nearestIndex = 0;
                const candidate = sortedOrders[nearestIndex];
                shortestDistance = haversine(currentLatitude, currentLongitude, candidate.customer.latitude, candidate.customer.longitude);
                travelTime = (shortestDistance / ROUTE_CONFIG.SPEED_KMH) * 60;
            }
            const selected = sortedOrders.splice(nearestIndex, 1)[0];
            if (!selected)
                break;
            const stopSeq = stops.length + 1;
            stops.push({
                order_id: selected.order_id,
                stop_seq: stopSeq,
                distance_km: Math.round(shortestDistance * 100) / 100,
                travel_time_min: travelTime,
                delivery_time_min: ROUTE_CONFIG.TIME_PER_STOP_MIN,
                latitude: selected.customer.latitude,
                longitude: selected.customer.longitude,
                order: selected,
            });
            currentDistance += shortestDistance;
            currentTime += travelTime + ROUTE_CONFIG.TIME_PER_STOP_MIN;
            currentBoxes += selected.qty;
            currentLatitude = selected.customer.latitude;
            currentLongitude = selected.customer.longitude;
        }
        if (stops.length === 0)
            break;
        const rider = {
            rider_id: riderIndex + 1,
            rider_code: `RD${String(riderIndex + 1).padStart(2, "0")}`,
            route_color: routeColor(riderIndex),
            max_orders: ROUTE_CONFIG.MAX_ORDERS_PER_ROUTE,
        };
        const deliveryCost = ROUTE_CONFIG.RIDER_BASE_FEE +
            currentDistance * currentBoxes * ROUTE_CONFIG.FUEL_RATE_PER_KM_BOX;
        const sales = currentBoxes * ROUTE_CONFIG.PRICE_PER_BOX;
        const foodCost = currentBoxes * ROUTE_CONFIG.FOOD_COST_PER_BOX;
        const netProfit = sales - foodCost - deliveryCost;
        const shortTime = Date.now().toString().slice(-6);
        const randomSuffix = Math.floor(10 + Math.random() * 90);
        const jobCode = `J-${shortTime}-${randomSuffix}-${rider.rider_code}`.slice(0, 20);
        jobSheets.push({
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
        });
        riderIndex++;
    }
    const totalOrders = jobSheets.reduce((sum, job) => sum + job.total_orders, 0);
    const totalBoxes = jobSheets.reduce((sum, job) => sum + job.total_boxes, 0);
    const totalDistanceKm = jobSheets.reduce((sum, job) => sum + job.distance_km, 0);
    const maxDurationMin = jobSheets.reduce((max, job) => Math.max(max, job.duration_min), 0);
    const sales = jobSheets.reduce((sum, job) => sum + job.sales, 0);
    const foodCost = jobSheets.reduce((sum, job) => sum + job.food_cost, 0);
    const riderBaseCost = jobSheets.length * ROUTE_CONFIG.RIDER_BASE_FEE;
    const deliveryDistanceCost = jobSheets.reduce((sum, job) => sum +
        job.distance_km * job.total_boxes * ROUTE_CONFIG.FUEL_RATE_PER_KM_BOX, 0);
    const finishMinutes = 11 * 60 + 30 + maxDurationMin;
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
            netProfit: Math.round((sales - foodCost - deliveryDistanceCost - riderBaseCost) * 100) /
                100,
            estimatedFinishTime: `${finishHours}:${formattedMinutes} น.`,
        },
    };
}
exports.router.get("/code/:jobCode", async (req, res) => {
    const jobCode = String(req.params.jobCode ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,30}$/.test(jobCode)) {
        res.status(400).json({ error: "Invalid job code" });
        return;
    }
    const { data: sheet, error: sheetError } = await dbconnect_1.dbconnect
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
    const { data: stops, error: stopsError } = await dbconnect_1.dbconnect
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
    let orders = [];
    let customers = [];
    if (orderIds.length > 0) {
        const { data: orderRows, error: ordersError } = await dbconnect_1.dbconnect
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
            const { data: customerRows, error: customersError } = await dbconnect_1.dbconnect
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
});
exports.router.post("/calculate", async (_req, res) => {
    const { data: orderRows, error: ordersError } = await dbconnect_1.dbconnect
        .from("orders")
        .select("order_id, customer_id, delivery_fee, qty, date");
    if (ordersError) {
        res.status(500).json({ error: ordersError.message });
        return;
    }
    const orders = orderRows ?? [];
    const customerIds = [...new Set(orders.map((order) => order.customer_id))];
    let customerById = new Map();
    if (customerIds.length > 0) {
        const { data: customerRows, error: customersError } = await dbconnect_1.dbconnect
            .from("customers")
            .select("customer_id, name, phone, latitude, longitude")
            .in("customer_id", customerIds);
        if (customersError) {
            res.status(500).json({ error: customersError.message });
            return;
        }
        customerById = new Map((customerRows ?? []).map((customer) => [
            customer.customer_id,
            {
                ...customer,
                latitude: Number(customer.latitude),
                longitude: Number(customer.longitude),
            },
        ]));
    }
    const validOrders = orders.flatMap((order) => {
        const customer = customerById.get(order.customer_id);
        if (!customer ||
            !Number.isFinite(customer.latitude) ||
            !Number.isFinite(customer.longitude) ||
            customer.latitude === 0 ||
            customer.longitude === 0) {
            return [];
        }
        return [{
                ...order,
                delivery_fee: Number(order.delivery_fee),
                qty: Number(order.qty),
                customer,
            }];
    });
    const result = calculateRoutes(validOrders);
    res.json({
        ...result,
        ordersSignature: getOrdersSignature(validOrders),
    });
});
exports.router.delete("/delete/:id", async (req, res) => {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
        res.status(400).json({ error: "Invalid order ID" });
        return;
    }
    const { data, error } = await dbconnect_1.dbconnect
        .from("job_stops")
        .delete()
        .eq("order_id", orderId)
        .select("order_id");
    if (error) {
        const errorMessage = error?.message || "Unknown error";
        res.status(500).json({ error: errorMessage });
        return;
    }
});
exports.router.post("/dispatch", async (req, res) => {
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
        res.status(400).json({ error: "Invalid job sheet or unknown rider reference" });
        return;
    }
    const { error: stopsDeleteError } = await dbconnect_1.dbconnect
        .from("job_stops")
        .delete()
        .not("job_id", "is", null);
    if (stopsDeleteError) {
        res.status(500).json({ error: stopsDeleteError.message });
        return;
    }
    const { error: sheetsDeleteError } = await dbconnect_1.dbconnect
        .from("job_sheets")
        .delete()
        .not("job_id", "is", null);
    if (sheetsDeleteError) {
        res.status(500).json({ error: sheetsDeleteError.message });
        return;
    }
    const { error: ridersDeleteError } = await dbconnect_1.dbconnect
        .from("riders")
        .delete()
        .not("rider_id", "is", null);
    if (ridersDeleteError) {
        res.status(500).json({ error: ridersDeleteError.message });
        return;
    }
    const riderRows = riders.map((rider) => ({
        rider_code: rider.rider_code,
        route_color: rider.route_color,
        max_orders: rider.max_orders ?? 3,
    }));
    const { data: riderData, error: riderError } = await dbconnect_1.dbconnect
        .from("riders")
        .insert(riderRows)
        .select("rider_id, rider_code");
    if (riderError) {
        res.status(500).json({ error: riderError.message || "Unknown error" });
        return;
    }
    const riderIdsByCode = new Map((riderData || []).map((rider) => [rider.rider_code, rider.rider_id]));
    const jobSheetRows = jobSheets.map((jobSheet) => ({
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
    const { data: jobSheetData, error: jobSheetError } = await dbconnect_1.dbconnect
        .from("job_sheets")
        .insert(jobSheetRows)
        .select("job_id, job_code");
    if (jobSheetError) {
        res.status(500).json({ error: jobSheetError.message || "Unknown error" });
        return;
    }
    const jobIdsByCode = new Map((jobSheetData || []).map((jobSheet) => [jobSheet.job_code, jobSheet.job_id]));
    const rows = jobSheets.flatMap((jobSheet) => (jobSheet.stops || []).map((stop) => ({
        job_id: jobIdsByCode.get(jobSheet.job_code),
        order_id: stop.order_id,
        stop_seq: stop.stop_seq,
        distance_km: stop.distance_km,
    })));
    const { data, error } = await dbconnect_1.dbconnect
        .from("job_stops")
        .insert(rows)
        .select();
    if (error) {
        const { error: cleanupError } = await dbconnect_1.dbconnect
            .from("job_sheets")
            .delete()
            .in("job_id", (jobSheetData || []).map((jobSheet) => jobSheet.job_id));
        res.status(500).json({
            error: cleanupError
                ? `${error.message}; additionally failed to remove newly-created job sheets: ${cleanupError.message}`
                : error.message || "Unknown error",
        });
        return;
    }
    res.json({ message: "Job sheets dispatched successfully", data: { jobStops: data, jobSheets: jobSheetData } });
});
//# sourceMappingURL=job-sheets.js.map