import { t } from "~/i18n/i18n";
import { Icon } from "~/shared/ui/icon";
import { Button } from "./button";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Shared/Actions/Button",
  component: Button,
  args: { children: "Save", variant: "primary", appearance: "filled", size: "md" },
  argTypes: {
    children: { control: false },
    leadingIcon: { control: false },
    variant: { control: "select", options: ["primary", "neutral", "danger"] },
    appearance: { control: "select", options: ["filled", "outline", "ghost"] },
    size: { control: "select", options: ["sm", "md", "lg"] },
  },
  render: (args) => <Button {...args}>{t("common.save")}</Button>,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Loading: Story = { args: { loading: true } };
export const WithIcon: Story = { args: { leadingIcon: <Icon name="plus" size={16} /> } };
export const FullWidth: Story = { args: { fullWidth: true } };
export const Appearances: Story = {
  render: () => (
    <div className="flex flex-wrap gap-3">
      {(["filled", "outline", "ghost"] as const).map((appearance) => (
        <div key={appearance} className="flex gap-3">
          <Button appearance={appearance}>{t("common.save")}</Button>
          <Button appearance={appearance} variant="neutral">
            {t("common.cancel")}
          </Button>
          <Button appearance={appearance} variant="danger">
            {t("common.delete")}
          </Button>
        </div>
      ))}
    </div>
  ),
};
