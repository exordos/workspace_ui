import { fn } from "storybook/test";
import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { PanelMenuRow } from "./panel-menu-row.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Shared/Navigation/PanelMenuRow",
  component: PanelMenuRow,
  args: { label: "", icon: "settings", onClick: fn() },
  render: (args) => (
    <PanelMenuRow
      {...args}
      label={t(args.tone === "danger" ? "common.delete" : "settings.appearance")}
      subtitle={args.subtitle ? t("settings.statusDialogHint") : undefined}
      right={<Icon name="chevron-right" size={18} />}
    />
  ),
  argTypes: { label: { control: false }, subtitle: { control: false }, right: { control: false } },
} satisfies Meta<typeof PanelMenuRow>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithSubtitle: Story = { args: { subtitle: true } };
export const CompactNested: Story = { args: { variant: "nested", density: "compact" } };
export const Disabled: Story = { args: { disabled: true } };
export const Danger: Story = { args: { tone: "danger", icon: "trash" } };
