import { t } from "~/i18n/i18n";
import { Copyable } from "./copyable";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Shared/Actions/Copyable",
  component: Copyable,
  args: { value: "design@example.test", children: "design@example.test", showOnHover: false },
  render: (args) => <Copyable {...args} copyAriaLabel={t("message.copy")} />,
  argTypes: { copyAriaLabel: { control: false } },
  parameters: {
    docs: {
      description: {
        component:
          "Copy affordance using the application clipboard wrapper. Clicking writes the synthetic value to your clipboard. Stories do not automatically copy or assert browser/Electron clipboard integration.",
      },
    },
  },
} satisfies Meta<typeof Copyable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ShowOnHover: Story = { args: { showOnHover: true } };
export const IconOnly: Story = { args: { children: undefined } };
export const LongValue: Story = {
  args: {
    value: "workspace-design-system-review@example.test",
    children: "workspace-design-system-review@example.test",
    contentClassName: "truncate",
    className: "max-w-64",
    iconSize: 18,
  },
};
