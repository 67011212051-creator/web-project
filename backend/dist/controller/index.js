"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.router = void 0;
const express_1 = __importDefault(require("express"));
const dbconnect_1 = require("./../dbconnect");
exports.router = express_1.default.Router();
exports.router.get('/', (req, res) => {
    res.send('Get in index.ts');
});
const getAllRows = (table) => async (_req, res) => {
    const { data, error } = await dbconnect_1.dbconnect.from(table).select('*');
    if (error) {
        res.status(500).json({ error: error.message });
        return;
    }
    res.json(data);
};
exports.router.get('/customers', getAllRows('customers'));
exports.router.get('/orders', getAllRows('orders'));
exports.router.get('/riders', getAllRows('riders'));
exports.router.get('/job_sheets', getAllRows('job_sheets'));
exports.router.get('/job_stops', getAllRows('job_stops'));
//# sourceMappingURL=index.js.map