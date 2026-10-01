import express from "express";
import { dbconnect } from './../dbconnect'
export const router = express.Router();

router.get('/', (req, res) => {
    res.send('Get in index.ts');
});

const getAllRows = (table: string) => async (_req: express.Request, res: express.Response) => {
  const { data, error } = await dbconnect.from(table).select('*')

  if (error) {
    res.status(500).json({ error: error.message })
    return
  }

  res.json(data)
}

router.get('/riders', getAllRows('riders'))
router.get('/job_sheets', getAllRows('job_sheets'))
router.get('/job_stops', getAllRows('job_stops'))