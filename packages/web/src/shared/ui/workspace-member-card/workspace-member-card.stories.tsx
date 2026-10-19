import { fn } from "storybook/test";
import { t } from "~/i18n/i18n";
import { Avatar } from "~/shared/ui/avatar";
import { Button } from "~/shared/ui/button";
import { WorkspaceMemberCard } from "./workspace-member-card.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Shared/Content/WorkspaceMemberCard",
  component: WorkspaceMemberCard,
  args: {
    avatar: <Avatar presence="active">AL</Avatar>,
    name: "Alex Morgan",
    secondaryText: "alex@example.test",
  },
  argTypes: {
    avatar: { control: false },
    action: { control: false },
    roleLabel: { control: false },
  },
} satisfies Meta<typeof WorkspaceMemberCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithAction: Story = {
  render: (args) => (
    <WorkspaceMemberCard
      {...args}
      roleLabel={t("roles.owner")}
      action={
        <Button size="sm" appearance="ghost" onClick={fn()}>
          {t("common.delete")}
        </Button>
      }
    />
  ),
};
export const LongContent: Story = {
  args: {
    name: "Alex Morgan With A Very Long Display Name For Narrow Panels",
    secondaryText: "alex-with-a-very-long-email-address@example.test",
  },
};
export const Deactivated: Story = {
  args: {
    avatar: (
      <Avatar deactivated presence="offline">
        AL
      </Avatar>
    ),
  },
};
