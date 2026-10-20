import { fn } from "storybook/test";
import { FloatingScrollToBottomButton } from "./floating-scroll-to-bottom-button";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Shared/Navigation/FloatingScrollToBottomButton",
  component: FloatingScrollToBottomButton,
  args: { onClick: fn(), unreadCount: 0, inline: false },
  decorators: [
    (Story) => (
      <div className="relative h-40 rounded-lg border border-border-subtle bg-card-bg">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FloatingScrollToBottomButton>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithUnread: Story = { args: { unreadCount: 12 } };
export const LargeUnread: Story = { args: { unreadCount: 458 } };
export const Inline: Story = { args: { inline: true, unreadCount: 3 } };
