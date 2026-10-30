import { useState } from "react";
import { useArgs } from "storybook/preview-api";
import { t, useTranslation } from "~/i18n/i18n";
import { DatePicker } from "~/shared/ui/date-picker";
import { TimePicker } from "~/shared/ui/time-picker";
import { DateTimePicker } from "./date-time-picker.ui";
import type { DateTimePickerProps } from "./date-time-picker.types";
import type { Meta, StoryObj } from "@storybook/react-vite";

// Local fixtures keep calendar dates stable in every browser time zone.
const fixture = () => new Date(2025, 10, 10, 10, 58);
function Example(args: Readonly<DateTimePickerProps>) {
  const [{ value }, updateArgs] = useArgs<DateTimePickerProps>();
  const { locale } = useTranslation();
  const selected = value == null ? null : new Date(value);
  return (
    <div className="flex max-w-full flex-col items-start gap-4">
      <DateTimePicker
        {...args}
        value={selected}
        onValueChange={(next) => updateArgs({ value: next })}
      />
      <output aria-live="polite" className="text-sm text-text-secondary">
        {selected == null
          ? t("pickerExamples.empty")
          : t("pickerExamples.selected", {
              value: new Intl.DateTimeFormat(locale, {
                dateStyle: "medium",
                timeStyle: args.showSeconds ? "medium" : "short",
              }).format(selected),
            })}
      </output>
    </div>
  );
}
function OverviewExample({ showArrows }: Readonly<DateTimePickerProps>) {
  const [date, setDate] = useState<Date | null>(fixture);
  const [time, setTime] = useState<string | null>("10:58");
  const [dateTime, setDateTime] = useState<Date | null>(fixture);
  return (
    <div className="flex max-w-full flex-col items-start gap-8">
      <div className="flex max-w-full flex-wrap items-start gap-8">
        <section className="max-w-full">
          <h2 className="mb-3 text-base font-medium text-text-primary">{t("datePicker.label")}</h2>
          <DatePicker value={date} onValueChange={setDate} />
        </section>
        <section className="max-w-full">
          <h2 className="mb-3 text-base font-medium text-text-primary">{t("timePicker.label")}</h2>
          <TimePicker value={time} onValueChange={setTime} showArrows={showArrows} />
        </section>
      </div>
      <section className="max-w-full">
        <h2 className="mb-3 text-base font-medium text-text-primary">
          {t("dateTimePicker.label")}
        </h2>
        <DateTimePicker value={dateTime} onValueChange={setDateTime} showArrows={showArrows} />
      </section>
    </div>
  );
}
const meta = {
  title: "Shared/Forms/DateTimePicker",
  component: DateTimePicker,
  args: {
    value: fixture(),
    defaultMonth: fixture(),
    onValueChange: () => {},
    disabled: false,
    showArrows: true,
  },
  argTypes: {
    value: { control: "date" },
    defaultMonth: { control: false },
    min: { control: false },
    max: { control: false },
    onValueChange: { control: false },
    datePickerProps: { control: false },
    timePickerProps: { control: false },
  },
  render: Example,
} satisfies Meta<typeof DateTimePicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const NumbersOnly: Story = {
  args: {
    value: new Date(2025, 10, 10, 10, 58, 32),
    showSeconds: true,
    showArrows: false,
  },
};
export const Overview: Story = { render: OverviewExample };
export const WithSeconds: Story = {
  args: { value: new Date(2025, 10, 10, 10, 58, 32), showSeconds: true },
};
export const Empty: Story = { args: { value: null } };
export const Disabled: Story = { args: { disabled: true } };
export const ReadOnly: Story = { args: { readOnly: true } };
export const Bounded: Story = {
  args: { min: new Date(2025, 10, 10, 9, 30), max: new Date(2025, 10, 14, 18) },
};
