import { useState } from "react";
import { t } from "~/i18n/i18n";
import {
  STREAM_NOTIFICATION_LEVEL_OPTIONS,
  type NotificationLevel,
} from "~/shared/ui/notification-level-switch";
import { StreamNotificationLevelSwitch } from "./stream-notification-level-switch.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

function ProviderNotification({ provider }: { provider: string }) {
  const [value, setValue] = useState<NotificationLevel>(
    provider === "Telegram" ? "muted" : "subscribed",
  );
  const label = `${provider} · ${t("channel.notifications")}`;
  return (
    <div className="space-y-1">
      <p className="text-xs text-text-muted">{label}</p>
      <StreamNotificationLevelSwitch
        value={value}
        onChange={setValue}
        groupLabel={label}
        size="sm"
        options={STREAM_NOTIFICATION_LEVEL_OPTIONS.filter((option) => option.level !== "default")}
      />
    </div>
  );
}

function ProviderNotifications() {
  return (
    <div className="space-y-3 rounded-lg bg-bg-elevated p-4 text-text-primary">
      {["Workspace", "Telegram", "Zulip"].map((provider) => (
        <ProviderNotification key={provider} provider={provider} />
      ))}
    </div>
  );
}

const meta = {
  title: "Features/Notifications/Provider modes",
  component: ProviderNotifications,
} satisfies Meta<typeof ProviderNotifications>;
export default meta;
export const PersonalConversation: StoryObj<typeof meta> = {};
