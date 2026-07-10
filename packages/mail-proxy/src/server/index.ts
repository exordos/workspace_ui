/**
 * Mail-proxy HTTP server — REST facade over Mailcow IMAP/SMTP and SOGo CalDAV.
 */

import { createApp } from "./create-app";
import { mailProxyEnv } from "../shared/env.lib";
import { mailLog } from "../shared/logger.lib";
import { startSessionCleanup } from "../shared/session/session.lib";

const app = createApp();
const stopCleanup = startSessionCleanup();

const server = app.listen(mailProxyEnv.PORT, () => {
  mailLog.info("Mail proxy listening", {
    port: mailProxyEnv.PORT,
    docs: `http://localhost:${mailProxyEnv.PORT}/docs`,
    openApi: `http://localhost:${mailProxyEnv.PORT}/openapi.json`,
    sogoUrl: mailProxyEnv.SOGO_URL,
    caldavPrefix: mailProxyEnv.CALDAV_PREFIX,
  });
});

function shutdown(): void {
  stopCleanup();
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
