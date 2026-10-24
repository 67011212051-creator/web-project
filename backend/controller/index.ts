import express from "express";
import { queryRows } from "../dbconnect";
export const router = express.Router();

router.get('/', (req, res) => {
    res.send('Get in index.ts');
});

const getAllRows = (table: string) => async (_req: express.Request, res: express.Response) => {
  const data = await queryRows(`SELECT * FROM \`${table}\``);
  res.json(data);
}

router.get('/customers', getAllRows('customers'))
router.get('/orders', getAllRows('orders'))
router.get('/riders', getAllRows('riders'))
router.get('/job_sheets', getAllRows('job_sheets'))
router.get('/job_stops', getAllRows('job_stops'))
