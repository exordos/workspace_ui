import { t } from "~/i18n/i18n";
import { writeText } from "~/platform/desktop/clipboard";
import { Copyable } from "./copyable";
import type { Meta, StoryObj } from "@storybook/react-vite";

const DEFAULT_VALUE = "design@example.test";
const LONG_VALUE = "workspace-design-system-review@example.test";

const meta = {
  title: "Shared/Actions/Copyable",
  component: Copyable,
  args: {
    onCopy: () => writeText(DEFAULT_VALUE),
    children: DEFAULT_VALUE,
    showOnHover: false,
  },
  render: (args) => <Copyable {...args} copyAriaLabel={t("message.copy")} />,
  argTypes: { copyAriaLabel: { control: false }, onCopy: { control: false } },
  parameters: {
    docs: {
      description: {
        component:
          "Copy affordance with a caller-provided copy action and feedback. In the text examples, clicking writes the synthetic value to your clipboard.",
      },
    },
  },
} satisfies Meta<typeof Copyable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ShowOnHover: Story = { args: { showOnHover: true } };
export const IconOnly: Story = { args: { children: undefined } };
export const CustomCopyAction: Story = {
  args: { children: undefined, onCopy: () => Promise.resolve(true) },
};
export const LongValue: Story = {
  args: {
    onCopy: () => writeText(LONG_VALUE),
    children: LONG_VALUE,
    contentClassName: "truncate",
    className: "max-w-64",
    iconSize: 18,
  },
};
