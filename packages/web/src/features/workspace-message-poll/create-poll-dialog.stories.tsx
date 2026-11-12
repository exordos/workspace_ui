import { useState } from "react";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { CreatePollDialog } from "./create-poll-dialog.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

function Example() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("pollForm.title")}</Button>
      <CreatePollDialog open={open} onOpenChange={setOpen} onCreate={() => {}} />
    </>
  );
}
const meta = {
  title: "Features/Polls/Create poll",
  component: CreatePollDialog,
  render: Example,
  args: { open: true, onOpenChange: () => {}, onCreate: () => {} },
} satisfies Meta<typeof CreatePollDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
