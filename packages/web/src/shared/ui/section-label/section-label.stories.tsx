import { t } from "~/i18n/i18n";
import { SectionLabel } from "./section-label.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Shared/Content/SectionLabel",
  component: SectionLabel,
  args: { children: "", tone: "default", as: "p" },
  render: (args) => <SectionLabel {...args}>{t("channel.members")}</SectionLabel>,
  argTypes: { children: { control: false } },
} satisfies Meta<typeof SectionLabel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Muted: Story = { args: { tone: "muted" } };
export const Inline: Story = { args: { as: "span" } };
