/**
 * Mail-proxy HTTP server — REST facade over Mailcow IMAP/SMTP.
 */

import cors from "cors";
import express from "express";
import { mailProxyEnv } from "./mail-env.lib";
import { mailLog } from "./mail-logger.lib";
import { registerMailRoutes } from "./mail-routes";
import { startSessionCleanup } from "./mail-session.lib";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(
  cors({
    origin(origin, callback) {
      if (origin == null || mailProxyEnv.ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS not allowed"));
    },
    credentials: true,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

registerMailRoutes(app);

const stopCleanup = startSessionCleanup();

const server = app.listen(mailProxyEnv.PORT, () => {
  mailLog.info("Mail proxy listening", { port: mailProxyEnv.PORT });
});

function shutdown(): void {
  stopCleanup();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
