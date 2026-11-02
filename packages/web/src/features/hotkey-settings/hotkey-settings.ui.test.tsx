import { fireEvent, screen, within, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { HotkeysProvider, type HotkeyOverrides } from "~/shared/lib/hotkeys";
import { renderWithProviders } from "~/test/render";
import { HotkeySettingsDialog } from "./hotkey-settings.ui";

function Harness() {
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
      <HotkeySettingsDialog onClose={() => {}} />
    </HotkeysProvider>
  );
}

describe("hotkey settings", () => {
  it("records, rejects conflicts and reserved keys, resets, and restores focus", async () => {
    setLocale("en");
    renderWithProviders(<Harness />);
    const edit = screen.getByRole("button", { name: /Edit last message/ });
    fireEvent.click(edit);
    await waitFor(() => expect(screen.getByLabelText("Press a shortcut")).toHaveFocus());
    fireEvent.keyDown(screen.getByLabelText("Press a shortcut"), {
      key: "b",
      code: "KeyB",
      ctrlKey: true,
    });
    expect(screen.getByRole("alert")).toHaveTextContent("already in use");
    fireEvent.keyDown(screen.getByLabelText("Press a shortcut"), {
      key: "c",
      code: "KeyC",
      ctrlKey: true,
    });
    expect(screen.getByRole("alert")).toHaveTextContent("reserved");
    fireEvent.keyDown(screen.getByLabelText("Press a shortcut"), {
      key: "k",
      code: "KeyK",
      ctrlKey: true,
      shiftKey: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Press a shortcut")).not.toBeInTheDocument(),
    );
    expect(within(edit).getByText("Ctrl+Shift+K")).toBeInTheDocument();
    await waitFor(() => expect(edit).toHaveFocus());
    fireEvent.click(edit);
    await waitFor(() => expect(screen.getByLabelText("Press a shortcut")).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Press a shortcut")).not.toBeInTheDocument(),
    );
    expect(within(edit).queryByText("Ctrl+Shift+K")).not.toBeInTheDocument();
    fireEvent.click(edit);
    fireEvent.keyDown(screen.getByLabelText("Press a shortcut"), { key: "Escape", code: "Escape" });
    await waitFor(() =>
      expect(screen.queryByLabelText("Press a shortcut")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Close or cancel")).toBeInTheDocument();
  });
});
