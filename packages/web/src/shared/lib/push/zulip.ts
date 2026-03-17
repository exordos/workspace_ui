/**
 * Zulip Push Registration — registers/unregisters the FCM token with the Zulip server.
 *
 * Zulip server uses this token to send push notifications via its Push Notification
 * Service (which proxies through FCM). This is the standard way Zulip mobile/web
 * clients receive server-initiated notifications.
 *
 * API endpoints:
 *   POST /users/me/apns_device_token    — iOS (not used here)
 *   POST /users/me/android_gcm_reg_id   — FCM token registration (also used by web)
 *   DELETE /users/me/android_gcm_reg_id  — unregister
 */

import { zulipApi } from "~/shared/api/client";
import { createLogger } from "../logger";

const log = createLogger("push:zulip");

/**
 * Register an FCM token with the Zulip server.
 * The server will use this to send push notifications for new messages, DMs, mentions.
 */
export async function registerPushToken(token: string): Promise<boolean> {
  try {
    const res = await zulipApi.post("/users/me/android_gcm_reg_id", {
      token,
    });

    if (res.ok) {
      log.info("Push token registered with Zulip server");
      return true;
    }

    log.warn("Push token registration failed", { status: res.status });
    return false;
  } catch (err) {
    log.error("Push token registration error", { error: String(err) });
    return false;
  }
}

/**
 * Unregister the FCM token from the Zulip server.
 * Call on logout or when the token changes.
 */
export async function unregisterPushToken(token: string): Promise<boolean> {
  try {
    const res = await zulipApi.post("/users/me/android_gcm_reg_id/unregister", {
      token,
    });

    if (res.ok) {
      log.info("Push token unregistered from Zulip server");
      return true;
    }

    return false;
  } catch (err) {
    log.warn("Push token unregister error", { error: String(err) });
    return false;
  }
}
