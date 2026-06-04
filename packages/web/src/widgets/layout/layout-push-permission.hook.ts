import { useEffect } from "react";
import { pushService } from "~/shared/lib/push/push.service";
import { reportUnexpectedError } from "~/shared/lib/unexpected-error.lib";

function tryRegisterPushIfGranted(): void {
  if (pushService.getPermission() === "granted") {
    void pushService.register().catch((err) => reportUnexpectedError("push:register", err));
  }
}

/**
 * Registers FCM when permission is granted (re-checks on focus for manual browser grants).
 */
export function useLayoutPushPermission(options: { enabled: boolean }): void {
  const { enabled } = options;

  useEffect(() => {
    if (!enabled) return;

    tryRegisterPushIfGranted();

    const onFocus = (): void => {
      tryRegisterPushIfGranted();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [enabled]);
}
