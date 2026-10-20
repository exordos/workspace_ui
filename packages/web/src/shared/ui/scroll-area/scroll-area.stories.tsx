import { t } from "~/i18n/i18n";
import { ScrollArea } from "./scroll-area";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Shared/Layout/ScrollArea",
  component: ScrollArea,
  args: {
    children: null,
    className: "h-52 max-w-sm rounded-lg border border-border-subtle p-4",
    tabIndex: 0,
  },
  render: (args) => (
    <ScrollArea {...args} aria-label={t("settings.help")}>
      {Array.from({ length: 20 }, (_, index) => (
        <p key={index} className="py-2 text-sm text-text-primary">
          {t("settings.statusDialogHint")}
        </p>
      ))}
    </ScrollArea>
  ),
  argTypes: { children: { control: false } },
} satisfies Meta<typeof ScrollArea>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ShortContent: Story = {
  render: (args) => (
    <ScrollArea {...args} aria-label={t("settings.help")}>
      <p>{t("settings.help")}</p>
    </ScrollArea>
  ),
};
