import { useState } from "react";
import { t } from "~/i18n/i18n";
import { CheckboxIndicator } from "~/shared/ui/checkbox";
import { InlineTextField } from "./inline-text-field.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

function Example({
  initial = "",
  disabled = false,
  readOnly = false,
}: Readonly<{ initial?: string; disabled?: boolean; readOnly?: boolean }>) {
  const [value, setValue] = useState(initial);
  return (
    <div className="w-[360px] max-w-full rounded-lg bg-bg-elevated px-3 py-2">
      <InlineTextField
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label={t("pollBubble.newOption")}
        placeholder={t("pollBubble.addOptionPlaceholder")}
        leading={<CheckboxIndicator checked={false} className="!border-text-secondary" />}
        disabled={disabled}
        readOnly={readOnly}
      />
    </div>
  );
}

const meta = {
  title: "Shared/Forms/InlineTextField",
  component: InlineTextField,
  args: { value: "" },
  parameters: { layout: "padded" },
  render: () => <Example />,
} satisfies Meta<typeof InlineTextField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};
export const Filled: Story = {
  render: () => <Example initial={t("pollForm.questionPlaceholder")} />,
};
export const LongText: Story = {
  render: () => (
    <Example initial={`${t("pollForm.questionPlaceholder")} ${t("pollBubble.addOptionHint")}`} />
  ),
};
export const Disabled: Story = { render: () => <Example disabled /> };
export const ReadOnly: Story = {
  render: () => <Example initial={t("pollForm.questionPlaceholder")} readOnly />,
};
