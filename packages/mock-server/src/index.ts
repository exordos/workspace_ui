import { json, urlencoded } from "body-parser";
import cors from "cors";
import express from "express";
import { registerApiRoutes } from "./routes";

const PORT = process.env.MOCK_SERVER_PORT
  ? Number(process.env.MOCK_SERVER_PORT)
  : 4000;

const app = express();

app.use(
  cors({
    origin: "*",
  })
);
app.use(json());
app.use(urlencoded({ extended: true }));

// Basic auth for zulip-js compatibility (any credentials accepted in dev)
app.use("/api/v1", (_req, _res, next) => next());

registerApiRoutes(app);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[mock-server] Listening on http://localhost:${PORT}`);
});

