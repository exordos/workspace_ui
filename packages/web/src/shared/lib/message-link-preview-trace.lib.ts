/**
 * Debug tracing for link preview (flash / stale cache / re-render investigations).
 *
 * Logs at `debug` level under scope `link-preview:trace` — visible in dev console
 * and `window.__dev__.logs()` when min level is debug.
 *
 * Usage:
 *   import { traceLinkPreview } from "~/shared/lib/message-link-preview-trace.lib";
 *   traceLinkPreview("hook:state", { messageId: 1, status: "ready" });
 */
import { createLogger } from "~/shared/lib/logger";

const log = createLogger("link-preview:trace");

export function traceLinkPreview(event: string, data?: Record<string, unknown>): void {
  log.debug(event, data ?? {});
}
