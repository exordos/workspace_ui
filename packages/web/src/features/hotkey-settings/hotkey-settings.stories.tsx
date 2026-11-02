import { useState } from "react";
import { t } from "~/i18n/i18n";
import { HotkeysProvider, type HotkeyOverrides } from "~/shared/lib/hotkeys";
import { Button } from "~/shared/ui/button";
import { HotkeySettingsDialog } from "./hotkey-settings.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

function ControlledHotkeys() {
  const [open, setOpen] = useState(true);
  const [overrides, setOverrides] = useState<HotkeyOverrides>({});
  const [enabled, setEnabled] = useState(true);
  return (
    <HotkeysProvider
      overrides={overrides}
      enabled={enabled}
      onOverridesChange={(value) => {
        setOverrides(value);
        return true;
      }}
      onEnabledChange={(value) => {
        setEnabled(value);
        return true;
      }}
    >
      <Button onClick={() => setOpen(true)}>{t("hotkeys.title")}</Button>
      {open && <HotkeySettingsDialog onClose={() => setOpen(false)} />}
    </HotkeysProvider>
  );
}
const meta = { title: "Features/HotkeySettings", component: ControlledHotkeys } satisfies Meta<
  typeof ControlledHotkeys
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
