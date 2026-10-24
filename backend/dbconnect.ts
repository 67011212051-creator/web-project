import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import mysql, {
  type ResultSetHeader,
  type RowDataPacket,
} from "mysql2/promise";

const password = process.env.MYSQL_PASSWORD;
const sslCa =
  process.env.MYSQL_SSL_CA?.replace(/\\n/g, "\n") ||
  (process.env.MYSQL_SSL_CA_PATH
    ? readFileSync(resolve(process.cwd(), process.env.MYSQL_SSL_CA_PATH), "utf8")
    : undefined);

if (!password) {
  throw new Error("Missing MYSQL_PASSWORD in backend/.env");
}

export const dbconnect = mysql.createPool({
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

type QueryValue = string | number | boolean | Date | Buffer | null;

export async function queryRows<T extends RowDataPacket>(
  sql: string,
  values: QueryValue[] = [],
): Promise<T[]> {
  const [rows] = await dbconnect.execute<T[]>(sql, values);
  return rows;
}

export async function execute(
  sql: string,
  values: QueryValue[] = [],
): Promise<ResultSetHeader> {
  const [result] = await dbconnect.execute<ResultSetHeader>(sql, values);
  return result;
}
