import { useArgs } from "storybook/preview-api";
import { t } from "~/i18n/i18n";
import { Select } from "./select.ui";
import type { SelectProps } from "./select.types";
import type { Meta, StoryObj } from "@storybook/react-vite";

function ControlledSelect(args: Readonly<SelectProps>) {
  const [{ value }, updateArgs] = useArgs<SelectProps>();
  const setValue = (value: string) => updateArgs({ value });
  const options = [
    { value: "system", label: t("settings.themeSystem") },
    { value: "light", label: t("settings.themeLight"), description: t("settings.appearance") },
    { value: "dark", label: t("settings.themeDark") },
    { value: "unavailable", label: t("settings.servicesComingSoon"), disabled: true },
  ];
  return (
    <Select
      {...args}
      value={value}
      onValueChange={setValue}
      options={args.options.length === 0 ? [] : options}
      aria-label={t("settings.themeSettings")}
    />
  );
}

const meta = {
  title: "Shared/Forms/Select",
  component: Select,
  args: {
    value: "system",
    onValueChange: () => {},
    options: [{ value: "system", label: "System" }],
  },
  render: ControlledSelect,
  argTypes: {
    options: { control: false },
    "aria-label": { control: false },
    onValueChange: { control: false },
  },
  parameters: {
    docs: {
      description: {
        component:
          "Controlled selection with keyboard navigation, disabled options, and a portaled listbox. Use InputSelector when editable input is needed.",
      },
    },
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Placeholder: Story = { args: { value: "" } };
export const Disabled: Story = { args: { disabled: true } };
export const Invalid: Story = { args: { value: "", invalid: true, required: true } };
export const Compact: Story = { args: { size: "compact" } };
export const Empty: Story = { args: { value: "", options: [] } };
