"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbconnect = void 0;
exports.queryRows = queryRows;
exports.execute = execute;
require("dotenv/config");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const promise_1 = __importDefault(require("mysql2/promise"));
const password = process.env.MYSQL_PASSWORD;
const sslCa = process.env.MYSQL_SSL_CA?.replace(/\\n/g, "\n") ||
    (process.env.MYSQL_SSL_CA_PATH
        ? (0, node_fs_1.readFileSync)((0, node_path_1.resolve)(process.cwd(), process.env.MYSQL_SSL_CA_PATH), "utf8")
        : undefined);
if (!password) {
    throw new Error("Missing MYSQL_PASSWORD in backend/.env");
}
exports.dbconnect = promise_1.default.createPool({
    host: process.env.MYSQL_HOST ?? "mysql-30707ccd-msu-e0d7.d.aivencloud.com",
    port: Number(process.env.MYSQL_PORT ?? 22222),
    user: process.env.MYSQL_USER ?? "avnadmin",
    password,
    database: process.env.MYSQL_DATABASE ?? "defaultdb",
    ssl: {
        rejectUnauthorized: true,
        ...(sslCa ? { ca: sslCa } : {}),
    },
    waitForConnections: true,
    connectionLimit: 10,
});
async function queryRows(sql, values = []) {
    const [rows] = await exports.dbconnect.execute(sql, values);
    return rows;
}
async function execute(sql, values = []) {
    const [result] = await exports.dbconnect.execute(sql, values);
    return result;
}
//# sourceMappingURL=dbconnect.js.map