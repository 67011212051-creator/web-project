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
    const customerId = Number(req.params.id);
    if (!Number.isInteger(customerId) || customerId <= 0) {
        res.status(400).json({ error: "Invalid customer ID" });
        return;
    }
    const { data: orders, error: ordersError } = await dbconnect_1.dbconnect
        .from("orders")
        .select("order_id")
        .eq("customer_id", customerId)
        .limit(1);
    if (ordersError) {
        res.status(500).json({ error: ordersError.message });
        return;
    }
    if (orders?.length) {
        res.status(409).json({ error: "Customer has related orders" });
        return;
    }
    const { data, error } = await dbconnect_1.dbconnect.from("customers")
        .delete()
        .eq("customer_id", customerId)
        .select("customer_id");
    if (error) {
        if (error.code === "23503") {
            res.status(409).json({ error: "Customer has related orders" });
            return;
        }
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data);
});
exports.router.post("/add", async (req, res) => {
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        res.status(400).json({ error: "Request body must be a JSON object" });
        return;
    }
    const { name, phone, latitude, longitude } = req.body;
    const { data, error } = await dbconnect_1.dbconnect.from("customers")
        .insert([
        {
            name,
            phone,
            latitude,
            longitude
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
    const customerId = Number(req.params.id);
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
        res.status(400).json({ error: "Request body must be a JSON object" });
        return;
    }
    const { name, phone, latitude, longitude } = req.body;
    const { data, error } = await dbconnect_1.dbconnect.from("customers")
        .update({
        name,
        phone,
        latitude,
        longitude
    })
        .eq("customer_id", customerId)
        .select();
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data);
});
//# sourceMappingURL=customers.js.map