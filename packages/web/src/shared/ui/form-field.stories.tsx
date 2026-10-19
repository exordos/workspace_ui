import { useId } from "react";
import { t } from "~/i18n/i18n";
import { FormField } from "./form-field.ui";
import type { FormFieldProps } from "./form-field.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

function EmailField(args: Readonly<FormFieldProps>) {
  const id = useId();
  return (
    <FormField
      {...args}
      htmlFor={id}
      label={t("common.email")}
      error={args.error ? t("auth.invalidEmail") : undefined}
    >
      <input
        id={id}
        type="email"
        defaultValue={args.error ? "alex@" : "alex@example.test"}
        aria-invalid={Boolean(args.error)}
        className="w-full rounded-lg border border-border-subtle bg-text-field-bg px-3 py-2 text-text-primary focus:border-accent focus:outline-none"
      />
    </FormField>
  );
}

const meta = {
  title: "Shared/Forms/FormField",
  component: FormField,
  args: { label: "Email", htmlFor: "email", children: null },
  render: (args) => <EmailField {...args} />,
  argTypes: {
    label: { control: false },
    htmlFor: { control: false },
    children: { control: false },
    error: { control: false },
  },
} satisfies Meta<typeof FormField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const InvalidEmail: Story = { args: { error: "invalid" } };
