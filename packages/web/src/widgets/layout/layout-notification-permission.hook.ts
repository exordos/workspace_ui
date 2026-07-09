import { useCallback, useEffect, useState } from "react";
import { notificationService } from "~/shared/lib/notifications";
import type { NotificationPermissionStatus } from "~/shared/lib/notifications";
import {
  readNotificationPromptDismissed,
  shouldShowNotificationPermissionBanner,
  writeNotificationPromptDismissed,
} from "./layout-notification-permission.lib";

export function useLayoutNotificationPermission(options: {
  enabled: boolean;
  organizationId: string | null;
}): {
  visible: boolean;
  permission: NotificationPermissionStatus;
  enabling: boolean;
  enable: () => void;
  dismiss: () => void;
} {
  const { enabled, organizationId } = options;
  const [permission, setPermission] = useState<NotificationPermissionStatus>(() =>
    notificationService.getPermission(),
  );
  const [dismissed, setDismissed] = useState(() => readNotificationPromptDismissed(organizationId));
  const [enabling, setEnabling] = useState(false);

  const refreshPermission = useCallback(() => {
    setPermission(notificationService.getPermission());
  }, []);

  useEffect(() => {
    setDismissed(readNotificationPromptDismissed(organizationId));
    refreshPermission();
  }, [organizationId, refreshPermission]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const onFocus = (): void => {
      refreshPermission();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === "visible") {
        refreshPermission();
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, refreshPermission]);

  const visible = shouldShowNotificationPermissionBanner({
    enabled,
    permission,
    dismissed,
    notificationsSupported: notificationService.isSupported(),
  });

  const enable = useCallback(() => {
    setEnabling(true);
    void notificationService
      .requestPermission()
      .then((perm) => {
        setPermission(perm);
      })
      .finally(() => {
        setEnabling(false);
      });
  }, []);

  const dismiss = useCallback(() => {
    writeNotificationPromptDismissed(organizationId);
    setDismissed(true);
  }, [organizationId]);

  return { visible, permission, enabling, enable, dismiss };
}
