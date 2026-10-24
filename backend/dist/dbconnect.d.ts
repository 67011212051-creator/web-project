import "dotenv/config";
import mysql, { type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
export declare const dbconnect: mysql.Pool;
type QueryValue = string | number | boolean | Date | Buffer | null;
export declare function queryRows<T extends RowDataPacket>(sql: string, values?: QueryValue[]): Promise<T[]>;
export declare function execute(sql: string, values?: QueryValue[]): Promise<ResultSetHeader>;
export {};
//# sourceMappingURL=dbconnect.d.ts.map