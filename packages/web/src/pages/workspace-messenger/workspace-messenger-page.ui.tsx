import React, { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { t } from "~/i18n/i18n";
import { parseWorkspaceMessengerRoute } from "~/shared/lib/workspace-messenger-route.lib";
import { Icon } from "~/shared/ui/icon";

export const WorkspaceMessengerPage: React.FC = () => {
  const location = useLocation();
  const route = useMemo(() => parseWorkspaceMessengerRoute(location.pathname), [location.pathname]);
  const streamUuid = route?.kind === "stream" || route?.kind === "topic" ? route.streamUuid : null;
  const topicUuid = route?.kind === "topic" ? route.topicUuid : null;
  const stream = useMessengerStore((state) =>
    streamUuid != null ? state.streamsById[streamUuid] : undefined,
  );
  const topic = useMessengerStore((state) =>
    topicUuid != null ? state.topicsById[topicUuid] : undefined,
  );
  const loading = useMessengerStore((state) => state.isLoading);

  const title = topic?.name ?? stream?.name ?? t("chat.selectChat");
  let subtitle = t("chat.selectChannel");
  if (topic != null && stream != null) {
    subtitle = stream.name;
  } else if (stream != null) {
    subtitle = t("nav.messenger");
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg" data-testid="workspace-messenger-page">
      <div className="flex min-h-0 flex-1 items-center justify-center px-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-bg-elevated text-text-muted">
            <Icon name="chatBubble" size={22} />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
            <p className="text-sm text-text-muted">
              {loading && stream == null ? t("app.loading") : subtitle}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
