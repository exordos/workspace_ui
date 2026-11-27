import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateFolderModal } from "./create-folder-modal.ui";
import { FOLDER_COLOR_PRESETS } from "./folder-colors";
import { UpdateFolderModal } from "./update-folder-modal.ui";

describe("manage folders modals", () => {
  it("create modal preview contains folder icon", () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();

    render(<CreateFolderModal open onOpenChange={onOpenChange} onCreate={onCreate} />);

    const previewLabel = screen.getByText(/preview/i);
    const previewContainer = previewLabel.closest("div");
    expect(previewContainer).not.toBeNull();
    expect(previewContainer?.querySelector("svg")).not.toBeNull();
    const iconPath = previewContainer?.querySelector("path");
    expect(iconPath?.getAttribute("fill")).toBe("currentColor");
  });

  it("create modal submits name with selected color and closes on success", async () => {
    const onCreate = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();

    render(<CreateFolderModal open onOpenChange={onOpenChange} onCreate={onCreate} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: " Team " } });

    const colorButtons = screen
      .getAllByRole("button")
      .filter((el) => el.getAttribute("aria-pressed") !== null);
    fireEvent.click(colorButtons[1]!);

    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        name: "Team",
        backgroundColor: FOLDER_COLOR_PRESETS[1],
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("create modal keeps dialog open when create fails", async () => {
    const onCreate = vi.fn().mockResolvedValue(false);
    const onOpenChange = vi.fn();

    render(<CreateFolderModal open onOpenChange={onOpenChange} onCreate={onCreate} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: " Team " } });
    fireEvent.click(screen.getByRole("button", { name: /create/i }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledTimes(1);
    });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("update modal allows saving when only color changes and closes on success", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();

    render(
      <UpdateFolderModal
        open
        onOpenChange={onOpenChange}
        initialName="Work"
        initialBackgroundColor={FOLDER_COLOR_PRESETS[0]}
        onSave={onSave}
      />,
    );

    const colorButtons = screen
      .getAllByRole("button")
      .filter((el) => el.getAttribute("aria-pressed") !== null);
    fireEvent.click(colorButtons[2]!);

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({
        name: "Work",
        backgroundColor: FOLDER_COLOR_PRESETS[2],
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
