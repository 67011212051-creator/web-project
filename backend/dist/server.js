"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors")); // 1. import cors
const index_1 = require("./controller/index");
const orders_1 = require("./controller/orders");
const customers_1 = require("./controller/customers");
const job_sheets_1 = require("./controller/job-sheets");
exports.app = (0, express_1.default)();
exports.app.use(express_1.default.json());
// 2. เปิดใช้งาน CORS (แนะนำระบุ origin ที่อนุญาต หรือใช้ cors() เพื่อปลดล็อกทุก domain ในช่วง dev)
exports.app.use((0, cors_1.default)({
    origin: 'http://localhost:4200'
}));
exports.app.use("/", index_1.router);
exports.app.use("/orders", orders_1.router);
exports.app.use("/customers", customers_1.router);
exports.app.use("/job-sheets", job_sheets_1.router);
// เปลี่ยนจาก app.use เป็น app.get เพื่อไม่ให้ไปทับ HTTP method อื่นๆ
exports.app.get("/", (_req, res) => {
    res.send("Hello World!!!");
});
exports.app.listen(3000, () => {
    console.log('Backend running on');
});
//# sourceMappingURL=server.js.map