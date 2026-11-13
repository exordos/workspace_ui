import { useState } from "react";
import { t } from "~/i18n/i18n";
import { CompactTextField, CompactTextFieldInput } from "./compact-text-field.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

function Example({ initial = "" }: Readonly<{ initial?: string }>) {
  const [value, setValue] = useState(initial);
  return (
    <label className="block w-72 space-y-2 text-sm text-text-primary">
      <span>{t("pollForm.question")}</span>
      <CompactTextField>
        <CompactTextFieldInput
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t("pollForm.questionPlaceholder")}
        />
      </CompactTextField>
    </label>
  );
}
const meta = {
  title: "Shared/Forms/CompactTextField",
  component: CompactTextField,
  render: () => <Example />,
} satisfies Meta<typeof CompactTextField>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Empty: Story = {};
export const Filled: Story = { render: () => <Example initial="Team meeting" /> };
