/**
 * Workspace Push Registration facade.
 *
 * The current backend does not expose a push-token registration endpoint.
 */

import { createLogger } from "../logger";

const log = createLogger("push:messenger");

export function registerPushToken(_token: string): Promise<boolean> {
  log.warn("Push token registration is unsupported by the current backend");
  return Promise.resolve(false);
}

export function unregisterPushToken(_token: string): Promise<boolean> {
  log.warn("Push token unregister is unsupported by the current backend");
  return Promise.resolve(false);
}
