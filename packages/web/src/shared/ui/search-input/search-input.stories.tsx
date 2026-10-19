import { useArgs } from "storybook/preview-api";
import { t } from "~/i18n/i18n";
import { SearchInput } from "./search-input";
import type { SearchInputProps } from "./search-input.types";
import type { Meta, StoryObj } from "@storybook/react-vite";

function ControlledSearch(args: Readonly<SearchInputProps>) {
  const [{ value }, updateArgs] = useArgs<SearchInputProps>();
  const setValue = (value: string) => updateArgs({ value });
  return (
    <SearchInput
      {...args}
      value={value}
      onChange={setValue}
      placeholder={t("message.searchUsers")}
      ariaLabel={t("search.search")}
    />
  );
}

const meta = {
  title: "Shared/Forms/SearchInput",
  component: SearchInput,
  args: { value: "", onChange: () => {} },
  render: ControlledSearch,
  argTypes: {
    placeholder: { control: false },
    ariaLabel: { control: false },
    onChange: { control: false },
  },
} satisfies Meta<typeof SearchInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithValue: Story = { args: { value: "Alex" } };
export const Disabled: Story = { args: { value: "Alex", disabled: true } };
export const LargeWithLeadingIcon: Story = {
  args: { size: "md", iconPosition: "left", value: "Alex" },
};
export const LongValue: Story = {
  args: { value: "Alex Morgan • Workspace design system and accessibility review" },
};
