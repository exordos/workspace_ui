import { ICON_NAMES, Icon } from "./icon";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Shared/Identity/Icon",
  component: Icon,
  args: { name: "check", size: 24 },
  argTypes: {
    name: { control: "select", options: ICON_NAMES },
    size: { control: { type: "range", min: 12, max: 48, step: 2 } },
  },
} satisfies Meta<typeof Icon>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const EncryptedSpoiler: Story = {
  args: { name: "encrypted_spoiler", size: 32 },
};
export const Gallery: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
      {ICON_NAMES.map((name) => (
        <div
          key={name}
          className="flex min-w-0 flex-col items-center gap-3 rounded-lg border border-border-subtle bg-card-bg p-4 text-text-primary"
        >
          <Icon name={name} size={24} />
          <code className="max-w-full break-all text-center text-xs text-text-secondary">
            {name}
          </code>
        </div>
      ))}
    </div>
  ),
};
export const SizesAndTones: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <Icon name="check" size={16} />
      <Icon name="check" size={24} className="text-accent" />
      <Icon name="check" size={32} className="text-danger" />
      <Icon name="check" size={48} className="text-text-muted" />
    </div>
  ),
};
