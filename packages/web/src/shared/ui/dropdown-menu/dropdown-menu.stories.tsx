import { useState } from "react";
import { useArgs } from "storybook/preview-api";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { DropdownMenu } from "./dropdown-menu";
import type { DropdownMenuItem, DropdownMenuProps } from "./dropdown-menu";
import type { Meta, StoryObj } from "@storybook/react-vite";

function MenuExample(args: Readonly<DropdownMenuProps>) {
  const [{ open }, updateArgs] = useArgs<DropdownMenuProps>();
  const setOpen = (open: boolean) => updateArgs({ open });
  const [checked, setChecked] = useState(true);
  const items: DropdownMenuItem[] = [
    { type: "action", label: t("common.rename"), icon: "edit" },
    {
      type: "checkbox",
      label: t("channel.notifications"),
      checked,
      onCheckedChange: (next) => setChecked(next === true),
      keepOpenOnSelect: true,
    },
    {
      type: "submenu",
      label: t("settings.appearance"),
      items: [
        { type: "action", label: t("settings.themeLight") },
        { type: "action", label: t("settings.themeDark") },
      ],
    },
    { type: "action", label: t("settings.servicesComingSoon"), disabled: true },
    { type: "separator" },
    { type: "action", label: t("common.delete"), danger: true, icon: "trash" },
  ];
  return (
    <DropdownMenu
      {...args}
      open={open}
      onOpenChange={setOpen}
      items={items}
      trigger={<Button variant="neutral">{t("settings.settings")}</Button>}
    />
  );
}

const meta = {
  title: "Shared/Overlays/DropdownMenu",
  component: DropdownMenu,
  args: { open: false, onOpenChange: () => {}, items: [] },
  render: MenuExample,
  argTypes: {
    items: { control: false },
    trigger: { control: false },
    onOpenChange: { control: false },
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Open: Story = { args: { open: true } };
export const Wide: Story = { args: { open: true, contentVariant: "wide" } };
