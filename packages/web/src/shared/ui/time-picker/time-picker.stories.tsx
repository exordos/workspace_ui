import { useArgs } from "storybook/preview-api";
import { t } from "~/i18n/i18n";
import { TimePicker } from "./time-picker.ui";
import type { TimePickerProps } from "./time-picker.types";
import type { Meta, StoryObj } from "@storybook/react-vite";

function Example(args: Readonly<TimePickerProps>) {
  const [{ value }, updateArgs] = useArgs<TimePickerProps>();
  return (
    <div className="flex max-w-full flex-col items-start gap-4">
      <TimePicker {...args} value={value} onValueChange={(next) => updateArgs({ value: next })} />
      <output aria-live="polite" className="text-sm text-text-secondary">
        {value == null ? t("pickerExamples.empty") : t("pickerExamples.selected", { value })}
      </output>
    </div>
  );
}
const meta = {
  title: "Shared/Forms/TimePicker",
  component: TimePicker,
  args: {
    value: "10:58",
    onValueChange: () => {},
    disabled: false,
    showArrows: true,
  },
  argTypes: { onValueChange: { control: false }, isTimeDisabled: { control: false } },
  render: Example,
} satisfies Meta<typeof TimePicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const NumbersOnly: Story = {
  args: { value: "10:58:32", showSeconds: true, showArrows: false },
};

export const WithSeconds: Story = {
  args: { value: "10:58:32", showSeconds: true },
  parameters: {
    docs: {
      description: {
        story:
          "Hover the hour, minute or second segment and scroll without clicking. Scroll up to increase, down to decrease.",
      },
    },
  },
};
export const Empty: Story = { args: { value: null } };
export const Disabled: Story = { args: { disabled: true } };
export const Bounded: Story = { args: { value: "09:30", min: "09:30", max: "18:15" } };
export const ExcludedTimes: Story = {
  args: { value: "11:45", isTimeDisabled: (value) => value >= "12:00" && value < "14:00" },
};
