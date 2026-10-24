"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const dbconnect_1 = require("../dbconnect");
exports.router = express_1.default.Router();
exports.router.delete("/delete/:id", async (req, res) => {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) {
        res.status(400).json({ error: "Invalid order ID" });
        return;
    }
    const data = await (0, dbconnect_1.queryRows)("SELECT order_id FROM job_stops WHERE order_id = ?", [orderId]);
    const orderData = await (0, dbconnect_1.queryRows)("SELECT order_id FROM orders WHERE order_id = ?", [orderId]);
    await (0, dbconnect_1.execute)("DELETE FROM job_stops WHERE order_id = ?", [orderId]);
    await (0, dbconnect_1.execute)("DELETE FROM orders WHERE order_id = ?", [orderId]);
    res.json({ job_stops: data, orders: orderData });
});
exports.router.delete("/deleteByCustomerId/:customerId", async (req, res) => {
    const customerId = Number(req.params.customerId);
    if (!Number.isInteger(customerId) || customerId <= 0) {
        res.status(400).json({ error: "Invalid customer ID" });
        return;
    }
    const customerOrderIds = await (0, dbconnect_1.queryRows)("SELECT order_id FROM orders WHERE customer_id = ?", [customerId]);
    const orderIds = (customerOrderIds ?? []).map(({ order_id }) => order_id);
    if (orderIds.length === 0) {
        res.json({ job_stops: [], orders: [] });
        return;
    }
    const placeholders = orderIds.map(() => "?").join(", ");
    const data = await (0, dbconnect_1.queryRows)(`SELECT order_id FROM job_stops WHERE order_id IN (${placeholders})`, orderIds);
    const orderData = await (0, dbconnect_1.queryRows)("SELECT order_id FROM orders WHERE customer_id = ?", [customerId]);
    await (0, dbconnect_1.execute)(`DELETE FROM job_stops WHERE order_id IN (${placeholders})`, orderIds);
    await (0, dbconnect_1.execute)("DELETE FROM orders WHERE customer_id = ?", [customerId]);
    res.json({ job_stops: data, orders: orderData });
});
exports.router.post("/add", async (req, res) => {
    const { customer_id, qty } = req.body;
    const result = await (0, dbconnect_1.execute)("INSERT INTO orders (customer_id, qty) VALUES (?, ?)", [customer_id, qty]);
    const data = await (0, dbconnect_1.queryRows)("SELECT * FROM orders WHERE order_id = ?", [
        result.insertId,
    ]);
    res.status(201).json(data);
});
exports.router.put("/update/:id", async (req, res) => {
    const orderId = Number(req.params.id);
    const { customer_id, qty } = req.body;
    await (0, dbconnect_1.execute)("UPDATE orders SET customer_id = ?, qty = ? WHERE order_id = ?", [customer_id, qty, orderId]);
    const data = await (0, dbconnect_1.queryRows)("SELECT * FROM orders WHERE order_id = ?", [
        orderId,
    ]);
    res.json(data);
});
exports.router.post("/simulate", async (req, res) => {
    const count = Math.min(Math.max(Math.floor(Number(req.body?.count)) || 25, 1), 50);
    const clearOld = req.body?.clearOld === true;
    const customers = await (0, dbconnect_1.queryRows)("SELECT customer_id FROM customers");
    if (!customers || customers.length === 0) {
        res.status(400).json({ error: "ไม่มีลูกค้าในระบบสำหรับจำลองออเดอร์" });
        return;
    }
    let eligibleCustomers = customers;
    let existingOrderIds = [];
    if (clearOld) {
        const existingOrders = await (0, dbconnect_1.queryRows)("SELECT order_id FROM orders");
        existingOrderIds = (existingOrders ?? []).map(({ order_id }) => order_id);
    }
    else {
        const existingOrders = await (0, dbconnect_1.queryRows)("SELECT customer_id FROM orders");
        const usedCustomerIds = new Set((existingOrders ?? []).map(({ customer_id }) => customer_id));
        eligibleCustomers = customers.filter(({ customer_id }) => !usedCustomerIds.has(customer_id));
    }
    if (eligibleCustomers.length === 0) {
        res.status(400).json({ error: "ไม่มีลูกค้าที่ว่างสำหรับจำลองออเดอร์" });
        return;
    }
    if (clearOld && existingOrderIds.length > 0) {
        const placeholders = existingOrderIds.map(() => "?").join(", ");
        await (0, dbconnect_1.execute)(`DELETE FROM job_stops WHERE order_id IN (${placeholders})`, existingOrderIds);
        await (0, dbconnect_1.execute)(`DELETE FROM orders WHERE order_id IN (${placeholders})`, existingOrderIds);
    }
    const shuffledCustomers = [...eligibleCustomers];
    for (let i = shuffledCustomers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const customer = shuffledCustomers[i];
        shuffledCustomers[i] = shuffledCustomers[j];
        shuffledCustomers[j] = customer;
    }
    const rows = shuffledCustomers.slice(0, count).map(({ customer_id }) => ({
        customer_id,
        qty: Math.floor(Math.random() * 3) + 1,
        delivery_fee: 0,
    }));
    const data = [];
    for (const row of rows) {
        const result = await (0, dbconnect_1.execute)("INSERT INTO orders (customer_id, qty, delivery_fee) VALUES (?, ?, ?)", [row.customer_id, row.qty, row.delivery_fee]);
        const [inserted] = await (0, dbconnect_1.queryRows)("SELECT * FROM orders WHERE order_id = ?", [result.insertId]);
        if (inserted)
            data.push(inserted);
    }
    res.status(201).json(data);
});
//# sourceMappingURL=orders.js.map