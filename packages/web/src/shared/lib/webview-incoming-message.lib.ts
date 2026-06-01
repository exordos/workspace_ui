/**
 * Logging and fan-out for native WebView postMessage events.
 */

import { parseNativeMessage } from "./webview-native-message.lib";
import type { Logger } from "./logger";
import type { NativeMessage } from "./webview";

export function nativeMessageTypeHint(data: unknown): string {
  if (typeof data !== "object" || data == null || !("type" in data)) {
    return "unknown";
  }
  return String((data as Record<string, unknown>).type);
}

export function logRejectedNativeOrigin(
  log: Logger,
  origin: string,
  inWebViewContext: boolean,
): void {
  if (inWebViewContext) {
    log.warn("Rejected message from untrusted origin", { origin });
    return;
  }
  log.debug("Ignored non-native message from untrusted origin", { origin });
}

export function logRejectedMalformedNativeMessage(
  log: Logger,
  data: unknown,
  inWebViewContext: boolean,
): void {
  const typeHint = nativeMessageTypeHint(data);
  if (inWebViewContext) {
    log.warn("Rejected malformed native message", { type: typeHint });
    return;
  }
  log.debug("Ignored non-native window message payload", { type: typeHint });
}

export function parseIncomingNativeMessage(data: unknown): NativeMessage | null {
  return parseNativeMessage(data);
}

export function dispatchNativeMessageToHandlers(
  msg: NativeMessage,
  handlers: ReadonlySet<(msg: NativeMessage) => void>,
  log: Logger,
): void {
  handlers.forEach((h) => {
    try {
      h(msg);
    } catch (err) {
      log.warn("Native message handler error", { error: String(err) });
    }
  });
}
