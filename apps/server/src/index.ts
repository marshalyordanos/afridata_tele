import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer } from "node:http";
import cors from "cors";
import { usersRouter } from "./routes/users.js";
import { transactionsRouter } from "./routes/transactions.js";
import { walletRouter } from "./routes/wallet.js";
import { agentsRouter } from "./routes/agents.js";
import { authRouter } from "./routes/auth.js";
import { adminsRouter } from "./routes/admins.js";
import { initRealtime } from "./lib/realtime.js";

const app = express();
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.use("/api/users", usersRouter);
app.use("/api/transactions", transactionsRouter);
app.use("/api/wallet", walletRouter);
app.use("/api/auth", authRouter);
app.use("/api/agents", agentsRouter);
app.use("/api/admins", adminsRouter);

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

// socket.io shares the HTTP server, so the handsets connect on the same port
// and address the app is already configured with.
const server = createServer(app);
initRealtime(server);

server.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log(`Realtime socket on the same port`);
});
