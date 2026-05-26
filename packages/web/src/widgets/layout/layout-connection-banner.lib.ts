import { t } from "~/i18n/i18n";
import type { ConnectionHealthSnapshot } from "~/shared/lib/connection-health";

export function resolveLayoutConnectionBannerMessage(
  online: boolean,
  health: ConnectionHealthSnapshot,
  rateLimitSeconds: number,
): string | null {
  if (!online || health.phase === "offline") {
    return t("app.offline");
  }
  if (rateLimitSeconds > 0) {
    return t("app.rateLimitResume", { seconds: rateLimitSeconds });
  }
  if (health.phase === "rate_limited" && health.retryAfterMs > 0) {
    const seconds = Math.max(1, Math.ceil(health.retryAfterMs / 1000));
    return t("app.retryIn", { seconds });
  }
  if (health.isReconnecting) {
    return t("app.reconnecting");
  }
  if (
    health.failureReason === "network" ||
    health.phase === "degraded" ||
    health.phase === "blocked"
  ) {
    return t("app.connectionDegraded");
  }
  return null;
}
