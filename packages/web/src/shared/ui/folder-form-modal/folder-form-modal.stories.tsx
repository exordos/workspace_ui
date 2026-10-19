import { useArgs } from "storybook/preview-api";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { FolderFormModal } from "./folder-form-modal.ui";
import type { FolderFormModalProps } from "./folder-form-modal.types";
import type { Meta, StoryObj } from "@storybook/react-vite";

function FolderFormExample(args: Readonly<FolderFormModalProps>) {
  const [{ open }, updateArgs] = useArgs<FolderFormModalProps>();
  return (
    <>
      <Button onClick={() => updateArgs({ open: true })}>{t("common.open")}</Button>
      <FolderFormModal {...args} open={open} onOpenChange={(open) => updateArgs({ open })} />
    </>
  );
}

const meta = {
  title: "Shared/Overlays/FolderFormModal",
  component: FolderFormModal,
  args: {
    mode: "create",
    open: false,
    onOpenChange: () => {},
    onSubmit: () => Promise.resolve(true),
  },
  argTypes: {
    onSubmit: { control: false },
    onOpenChange: { control: false },
    mode: { control: "select", options: ["create", "edit"] },
  },
  render: FolderFormExample,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Local folder form with the existing color presets. The synthetic submit callback resolves successfully without writing to a store or calling an API.",
      },
    },
  },
} satisfies Meta<typeof FolderFormModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Create: Story = { args: { open: true } };
export const Edit: Story = {
  args: { mode: "edit", open: true, initialName: "Workspace", initialBackgroundColor: 0x2563eb },
};
export const LongName: Story = {
  args: {
    mode: "edit",
    open: true,
    initialName: "Workspace • Design system and accessibility review",
  },
};
