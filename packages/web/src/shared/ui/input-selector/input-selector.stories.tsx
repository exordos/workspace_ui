import { useArgs } from "storybook/preview-api";
import { expect, userEvent, within } from "storybook/test";
import { t } from "~/i18n/i18n";
import { InputSelector } from "./input-selector.ui";
import type { InputSelectorProps } from "./input-selector.types";
import type { Meta, StoryObj } from "@storybook/react-vite";

function InputSelectorExample(args: Readonly<InputSelectorProps>) {
  const [{ value }, updateArgs] = useArgs<InputSelectorProps>();
  return (
    <InputSelector
      {...args}
      value={value}
      onValueChange={(value) => updateArgs({ value })}
      aria-label={t("settings.timezone")}
      placeholder={t("settings.timezonePlaceholder")}
    />
  );
}

const meta = {
  title: "Shared/Forms/InputSelector",
  component: InputSelector,
  args: {
    value: "",
    onValueChange: () => {},
    searchable: true,
    options: [
      { value: "Europe/Moscow", label: "Moscow" },
      { value: "Europe/Berlin", label: "Berlin" },
      { value: "Asia/Tokyo", label: "Tokyo" },
      { value: "Pacific/Auckland", label: "Auckland", disabled: true },
    ],
  },
  argTypes: {
    onValueChange: { control: false },
    "aria-label": { control: false },
    placeholder: { control: false },
  },
  render: InputSelectorExample,
  parameters: {
    docs: {
      description: {
        component:
          "Editable selection with local options. Typing changes the caller-owned value and optionally filters suggestions. Use Select when free text is not allowed.",
      },
    },
  },
} satisfies Meta<typeof InputSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithValue: Story = { args: { value: "Europe/Moscow" } };
export const Disabled: Story = { args: { value: "Europe/Moscow", disabled: true } };
export const ReadOnly: Story = { args: { value: "Europe/Moscow", readOnly: true } };
export const Invalid: Story = { args: { value: "Mars/Olympus", invalid: true } };
export const EmptyOptions: Story = { args: { options: [] } };
export const KeyboardSelection: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("combobox", { name: t("settings.timezone") });
    await userEvent.click(input);
    await userEvent.type(input, "Berlin");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await expect(input).toHaveValue("Europe/Berlin");
  },
};
