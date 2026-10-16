"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const dbconnect_1 = require("./../dbconnect");
exports.router = express_1.default.Router();
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
    const { data: orderData, error: orderError } = await dbconnect_1.dbconnect
        .from("orders")
        .delete()
        .eq("order_id", orderId)
        .select("order_id");
    if (error || orderError) {
        const errorMessage = error?.message || orderError?.message || "Unknown error";
        res.status(500).json({ error: errorMessage });
        return;
    }
    res.json({ job_stops: data, orders: orderData });
});
exports.router.delete("/deleteByCustomerId/:customerId", async (req, res) => {
    const customerId = Number(req.params.customerId);
    if (!Number.isInteger(customerId) || customerId <= 0) {
        res.status(400).json({ error: "Invalid customer ID" });
        return;
    }
    const { data: customerOrderIds, error: customerOrderIdsError } = await dbconnect_1.dbconnect
        .from("orders")
        .select("order_id")
        .eq("customer_id", customerId);
    if (customerOrderIdsError) {
        res.status(500).json({ error: customerOrderIdsError.message });
        return;
    }
    const orderIds = (customerOrderIds ?? []).map(({ order_id }) => order_id);
    if (orderIds.length === 0) {
        res.json({ job_stops: [], orders: [] });
        return;
    }
    const { data, error } = await dbconnect_1.dbconnect
        .from("job_stops")
        .delete()
        .in("order_id", orderIds)
        .select("order_id");
    const { data: orderData, error: orderError } = await dbconnect_1.dbconnect
        .from("orders")
        .delete()
        .eq("customer_id", customerId)
        .select("order_id");
    if (error || orderError) {
        const errorMessage = error?.message || orderError?.message || "Unknown error";
        res.status(500).json({ error: errorMessage });
        return;
    }
    res.json({ job_stops: data, orders: orderData });
});
exports.router.post("/add", async (req, res) => {
    const { customer_id, qty } = req.body;
    const { data, error } = await dbconnect_1.dbconnect.from("orders")
        .insert([
        {
            customer_id,
            qty
        }
    ])
        .select();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.status(201).json(data);
});
exports.router.put("/update/:id", async (req, res) => {
    const orderId = Number(req.params.id);
    const { customer_id, qty } = req.body;
    const { data, error } = await dbconnect_1.dbconnect.from("orders")
        .update({
        customer_id,
        qty
    })
        .eq("order_id", orderId)
        .select();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data);
});
//# sourceMappingURL=orders.js.map