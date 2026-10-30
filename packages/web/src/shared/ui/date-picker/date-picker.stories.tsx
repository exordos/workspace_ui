import { useArgs } from "storybook/preview-api";
import { t, useTranslation } from "~/i18n/i18n";
import { DatePicker } from "./date-picker.ui";
import type { DatePickerProps } from "./date-picker.types";
import type { Meta, StoryObj } from "@storybook/react-vite";

function Example(args: Readonly<DatePickerProps>) {
  const [{ value }, updateArgs] = useArgs<DatePickerProps>();
  const { locale } = useTranslation();
  const selected = value == null ? null : new Date(value);
  return (
    <div className="flex max-w-full flex-col items-start gap-4">
      <DatePicker
        {...args}
        value={selected}
        onValueChange={(next) => updateArgs({ value: next })}
      />
      <output aria-live="polite" className="text-sm text-text-secondary">
        {selected == null
          ? t("pickerExamples.empty")
          : t("pickerExamples.selected", {
              value: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(selected),
            })}
      </output>
    </div>
  );
}

const meta = {
  title: "Shared/Forms/DatePicker",
  component: DatePicker,
  args: {
    value: new Date(2025, 10, 10),
    defaultMonth: new Date(2025, 10, 1),
    onValueChange: () => {},
    disabled: false,
  },
  argTypes: {
    value: { control: "date" },
    min: { control: false },
    max: { control: false },
    defaultMonth: { control: false },
    onValueChange: { control: false },
  },
  render: Example,
} satisfies Meta<typeof DatePicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {
  parameters: {
    docs: {
      description: { story: "Use Today to select the current local date from the example month." },
    },
  },
};
export const CurrentDay: Story = { args: { value: null, defaultMonth: new Date() } };
export const TodaySelected: Story = { args: { value: new Date() } };
export const Empty: Story = { args: { value: null } };
export const Disabled: Story = { args: { disabled: true } };
export const ReadOnly: Story = { args: { readOnly: true } };
export const Bounded: Story = {
  args: { min: new Date(2025, 10, 10), max: new Date(2025, 10, 15) },
};
export const SixWeekMonth: Story = { args: { value: new Date(2026, 2, 15) } };

export const NarrowWidth: Story = {
  decorators: [
    (Story) => (
      <div className="w-[288px] max-w-full">
        <Story />
      </div>
    ),
  ],
};
