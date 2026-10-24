import express from 'express'
import cors from 'cors'
import { router as index } from "./controller/index";
import { router as orders } from "./controller/orders";
import { router as customers } from "./controller/customers";
import { router as job_sheets } from "./controller/job-sheets";

export const app = express();

app.use(express.json());

app.use(cors({
  origin: 'https://web-project-frontend-sandy.vercel.app'
}))

app.use("/", index);
app.use("/orders", orders);
app.use("/customers", customers);
app.use("/job-sheets", job_sheets);

app.get("/", (_req, res) => {
  res.send("Hello World!!!");
});

app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  },
);

app.listen(3000, () => {
  console.log('Backend running')
})