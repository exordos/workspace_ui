import { useEffect } from "react";
import type { RuntimeInstance } from "~/entities/instance/instance.model";
import { buildRouteFromPushNotificationClick } from "~/shared/lib/push-click";
import type { NavigateFunction } from "react-router-dom";

export function useLayoutPushClickRouting(options: {
  currentInstanceId: string | null;
  instances: RuntimeInstance[];
  setCurrentInstanceId: (id: string) => void;
  navigate: NavigateFunction;
}): void {
  const { navigate } = options;

  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== "PUSH_NOTIFICATION_CLICK") return;

      const route = buildRouteFromPushNotificationClick({
        messageId: event.data.messageId,
        messageType: event.data.messageType,
        streamId: event.data.streamId,
        streamName: event.data.streamName,
        topic: event.data.topic,
        senderId: event.data.senderId,
        realmUri: event.data.realmUri,
      });

      void navigate(route);
    };

    sw.addEventListener("message", handleMessage);
    return () => sw.removeEventListener("message", handleMessage);
  }, [navigate]);
}
