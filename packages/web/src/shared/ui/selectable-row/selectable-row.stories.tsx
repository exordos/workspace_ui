import { useState } from "react";
import { t } from "~/i18n/i18n";
import { Badge } from "~/shared/ui/badge";
import { SelectableRow } from "./selectable-row.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

function RowSelection() {
  const [activeKey, setActiveKey] = useState("all");
  return (
    <div className="space-y-1">
      {[
        { key: "all", label: t("common.all"), count: 42 },
        { key: "favorites", label: t("common.favorites"), count: 3 },
        { key: "channels", label: t("channel.browseChannels"), count: 125 },
      ].map((row) => (
        <SelectableRow
          key={row.key}
          as="button"
          active={row.key === activeKey}
          onClick={() => setActiveKey(row.key)}
        >
          <span className="min-w-0 flex-1 truncate">{row.label}</span>
          <Badge count={row.count} />
        </SelectableRow>
      ))}
    </div>
  );
}

const meta = {
  title: "Shared/Lists/SelectableRow",
  component: SelectableRow,
  args: { children: "All" },
  argTypes: { children: { control: false } },
  render: (args) => <SelectableRow {...args}>{t("common.all")}</SelectableRow>,
} satisfies Meta<typeof SelectableRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Active: Story = { args: { active: true } };
export const InteractiveList: Story = { render: () => <RowSelection /> };
export const LongLabel: Story = {
  render: (args) => (
    <SelectableRow {...args}>
      <span className="min-w-0 truncate">{t("settings.chatSortingPrioritizeUnmuted")}</span>
      <Badge count={458} rounded="md" />
    </SelectableRow>
  ),
};
