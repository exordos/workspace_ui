import { useState } from "react";
import { t } from "~/i18n/i18n";
import { Checkbox } from "./checkbox.ui";
import type { CheckboxProps } from "./checkbox.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

function CheckboxExample(args: CheckboxProps) {
  const [checked, setChecked] = useState(args.checked);
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary">
      <Checkbox
        {...args}
        checked={checked}
        onChange={(event) => setChecked(event.target.checked)}
      />
      {t("pollForm.multiple")}
    </label>
  );
}

const meta = {
  title: "Shared/Forms/Checkbox",
  component: Checkbox,
  args: { checked: false, size: 16, tone: "accent" },
  argTypes: {
    size: { control: "inline-radio", options: [16, 20] },
    tone: { control: "inline-radio", options: ["accent", "success"] },
  },
  render: (args) => <CheckboxExample key={String(args.checked)} {...args} />,
} satisfies Meta<typeof Checkbox>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Checked: Story = { args: { checked: true } };
export const Disabled: Story = { args: { disabled: true } };
export const DisabledChecked: Story = { args: { checked: true, disabled: true } };
export const Success: Story = { args: { checked: true, tone: "success" } };
export const Large: Story = { args: { size: 20, tone: "success" } };
export const StatesAndSizes: Story = {
  render: () => (
    <div className="space-y-4 text-text-primary">
      {([16, 20] as const).map((size) => (
        <div key={size} className="flex items-center gap-5">
          <span className="text-xs">{size} px</span>
          {([false, true] as const).map((checked) => (
            <Checkbox
              key={String(checked)}
              size={size}
              checked={checked}
              aria-label={t("pollForm.multiple")}
              readOnly
            />
          ))}
          <Checkbox
            size={size}
            checked
            tone="success"
            aria-label={t("pollBubble.correct")}
            readOnly
          />
          <Checkbox size={size} checked={false} disabled aria-label={t("pollForm.multiple")} />
          <Checkbox size={size} checked disabled aria-label={t("pollForm.multiple")} />
        </div>
      ))}
    </div>
  ),
};
