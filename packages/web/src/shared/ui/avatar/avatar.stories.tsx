import { t } from "~/i18n/i18n";
import { Avatar } from "./avatar";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Shared/Identity/Avatar",
  component: Avatar,
  args: { children: "AL", size: "md", presence: "active" },
  argTypes: {
    size: { control: "select", options: ["xs", "sm", "md", "lg", "xl"] },
    presence: { control: "select", options: [null, "active", "idle", "offline"] },
  },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-5">
      {(["sm", "xs", "md", "lg", "xl"] as const).map((size) => (
        <Avatar key={size} size={size} presence="active">
          AL
        </Avatar>
      ))}
    </div>
  ),
};
export const Presence: Story = {
  render: () => (
    <div className="flex items-center gap-5">
      <Avatar presence="active">AL</Avatar>
      <Avatar presence="idle">BT</Avatar>
      <Avatar presence="offline">CW</Avatar>
      <Avatar presence={null}>DK</Avatar>
      <Avatar deactivated presence="active">
        EL
      </Avatar>
    </div>
  ),
};
export const ImageFallback: Story = {
  args: { src: "data:image/png;base64,broken-image", children: "AL" },
};
export const Interactive: Story = {
  args: { interactive: true },
  render: (args) => (
    <button
      type="button"
      className="group/avatar rounded-full focus-visible:outline-none"
      aria-label={t("settings.editProfile")}
    >
      <Avatar {...args} />
    </button>
  ),
};

export const InteractiveWithoutPresence: Story = {
  ...Interactive,
  args: { interactive: true, presence: null },
};
