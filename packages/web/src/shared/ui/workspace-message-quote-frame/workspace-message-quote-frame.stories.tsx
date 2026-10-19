import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { WorkspaceMessageQuoteFrame } from "./workspace-message-quote-frame.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Shared/Content/WorkspaceMessageQuoteFrame",
  component: WorkspaceMessageQuoteFrame,
  args: { header: "Alex Morgan", surface: "message" },
  render: (args) => (
    <WorkspaceMessageQuoteFrame {...args}>
      <p className="text-sm text-text-primary">{t("settings.statusDialogHint")}</p>
    </WorkspaceMessageQuoteFrame>
  ),
  argTypes: { children: { control: false }, leading: { control: false } },
} satisfies Meta<typeof WorkspaceMessageQuoteFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Composer: Story = { args: { surface: "composer" } };
export const MutedHeader: Story = { args: { headerMuted: true } };
export const WithLeadingMedia: Story = { args: { leading: <Icon name="images" size={32} /> } };
export const LongHeader: Story = {
  args: { header: "Alex Morgan With A Very Long Display Name For Narrow Panels" },
};
