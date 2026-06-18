/**
 * Express application factory for mail-proxy.
 */

import cors from "cors";
import express from "express";
import { registerCalendarRoutes } from "../calendar/calendar.routes";
import { registerMailRoutes } from "../mail/mail.routes";
import { mailProxyEnv } from "../shared/env.lib";

export function createApp(): express.Express {
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
  registerCalendarRoutes(app);

  return app;
}
