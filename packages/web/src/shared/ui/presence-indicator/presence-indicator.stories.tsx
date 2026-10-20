import { t } from "~/i18n/i18n";
import { PresenceIndicator } from "./presence-indicator";
import { resolvePresenceStatusTextClass } from "./presence-status-text.lib";
import type { Meta, StoryObj } from "@storybook/react-vite";

const STATUS_LABEL_KEYS = {
  active: "presence.online",
  idle: "presence.away",
  offline: "presence.offline",
} as const;

const meta = {
  title: "Shared/Identity/PresenceIndicator",
  component: PresenceIndicator,
  args: { status: "active", size: "md", withBorder: true },
  argTypes: {
    status: { control: "select", options: ["active", "idle", "offline", null] },
    size: { control: "select", options: ["xs", "sm", "md", "lg"] },
  },
} satisfies Meta<typeof PresenceIndicator>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Deactivated: Story = { args: { deactivated: true } };
export const Hidden: Story = { args: { status: null } };
export const StatusesAndSizes: Story = {
  render: () => (
    <div className="space-y-4">
      {(["active", "idle", "offline"] as const).map((status) => (
        <div key={status} className="flex items-center gap-5">
          {(["xs", "sm", "md", "lg"] as const).map((size) => (
            <PresenceIndicator key={size} status={status} size={size} />
          ))}
          <span className={resolvePresenceStatusTextClass(status)}>
            {t(STATUS_LABEL_KEYS[status])}
          </span>
        </div>
      ))}
    </div>
  ),
};
