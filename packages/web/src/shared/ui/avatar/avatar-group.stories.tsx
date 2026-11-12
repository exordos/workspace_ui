import { t } from "~/i18n/i18n";
import { Avatar } from "./avatar";
import { AvatarGroup } from "./avatar-group.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const colors = ["#805f86", "#517d83", "#a16b47", "#5f7092", "#787e50", "#946450"];
const items = ["Alex", "Blake", "Casey", "Drew", "Ellis", "Frankie"].map((name, index) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><rect width="28" height="28" fill="${colors[index]}"/><circle cx="14" cy="10" r="5" fill="#e7d9cc"/><ellipse cx="14" cy="27" rx="10" ry="11" fill="#e7d9cc"/></svg>`;
  return { id: `member-${index}`, name, src: `data:image/svg+xml,${encodeURIComponent(svg)}` };
});

const meta = {
  title: "Shared/Identity/AvatarGroup",
  component: AvatarGroup,
  args: { items, max: 5, size: 28, overlap: 8 },
  render: (args) => (
    <div className="inline-flex rounded-lg bg-msg-bg p-3">
      <AvatarGroup {...args} ariaLabel={t("channel.participants", { count: args.items.length })} />
    </div>
  ),
} satisfies Meta<typeof AvatarGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const TwoPeople: Story = { args: { items: items.slice(0, 2) } };
export const Empty: Story = { args: { items: [] } };
export const Initials: Story = { args: { items: items.map(({ id, name }) => ({ id, name })) } };
export const CustomAvatar: Story = {
  args: {
    renderAvatar: (item) => (
      <Avatar size="sm" src={item.src}>
        {item.name.slice(0, 1)}
      </Avatar>
    ),
  },
};
