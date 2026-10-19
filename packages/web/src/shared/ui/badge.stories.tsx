import { Badge } from "./badge";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Shared/Feedback/Badge",
  component: Badge,
  args: { count: 8, variant: "unread", size: "default" },
  argTypes: {
    variant: { control: "select", options: ["unread", "muted"] },
    size: { control: "select", options: ["default", "sm"] },
    rounded: { control: "select", options: ["full", "md"] },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Muted: Story = { args: { variant: "muted" } };
export const CountsAndSizes: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Badge count={0} />
      <Badge count={1} size="sm" />
      <Badge count={99} />
      <Badge count={458} rounded="md" />
      <Badge count={12345} variant="muted" rounded="md" />
    </div>
  ),
};
