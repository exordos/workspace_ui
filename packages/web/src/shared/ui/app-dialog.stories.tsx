import { useArgs } from "storybook/preview-api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { t } from "~/i18n/i18n";
import { AppDialog, AppDialogFormFooter } from "./app-dialog.ui";
import { Button } from "./button";
import type { AppDialogProps } from "./app-dialog.types";
import type { Meta, StoryObj } from "@storybook/react-vite";

function DialogExample(args: Readonly<AppDialogProps>) {
  const [{ open }, updateArgs] = useArgs<AppDialogProps>();
  const setOpen = (open: boolean) => updateArgs({ open });
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("common.open")}</Button>
      <AppDialog
        {...args}
        open={open}
        onOpenChange={setOpen}
        title={t("settings.editProfile")}
        description={t("settings.profileDisplayNameHint")}
        footer={
          <AppDialogFormFooter
            cancelLabel={t("common.cancel")}
            submitLabel={t("common.save")}
            onCancel={() => setOpen(false)}
            onSubmit={() => setOpen(false)}
          />
        }
      >
        <div className="space-y-4 text-sm text-text-primary">
          {Array.from({ length: args.scrollBody ? 20 : 1 }, (_, index) => (
            <p key={index}>{t("settings.statusDialogHint")}</p>
          ))}
        </div>
      </AppDialog>
    </>
  );
}

const meta = {
  title: "Shared/Overlays/AppDialog",
  component: AppDialog,
  args: { open: false, onOpenChange: () => {}, title: "Edit profile", children: null },
  render: DialogExample,
  argTypes: {
    title: { control: false },
    description: { control: false },
    children: { control: false },
    footer: { control: false },
    onOpenChange: { control: false },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof AppDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { open: true } };
export const ScrollableBody: Story = { args: { open: true, scrollBody: true } };
export const OpenAndDismiss: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: t("common.open") }));
    const dialog = await page.findByRole("dialog", { name: t("settings.editProfile") });
    await expect(dialog).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: t("common.cancel") }));
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(canvas.getByRole("button", { name: t("common.open") })).toBeVisible();
  },
};
