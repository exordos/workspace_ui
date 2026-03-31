import { useEffect } from "react";
import { pushService } from "~/shared/lib/push/push.service";

export function useLayoutPushPermission(options: { enabled: boolean; delayMs?: number }): void {
  const { enabled, delayMs = 5000 } = options;

  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      void pushService
        .requestPermission()
        .then((perm) => {
          if (perm === "granted") {
            void pushService.register();
          }
        })
        .catch(() => {});
    }, delayMs);
    return () => clearTimeout(timer);
  }, [enabled, delayMs]);
}

