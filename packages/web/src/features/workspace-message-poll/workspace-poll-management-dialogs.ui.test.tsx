import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { PollCloseDialog, PollSettingsDialog } from "./workspace-poll-management-dialogs.ui";

beforeEach(() => setLocale("en"));
it("keeps close confirmation open after failure and allows retry", async () => {
  const onClose = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(undefined);
  const onOpenChange = vi.fn();
  render(<PollCloseDialog open onOpenChange={onOpenChange} onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Close poll" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(onOpenChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Close poll" }));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(onClose).toHaveBeenCalledTimes(2);
});
it("keeps edited settings after save failure", async () => {
  const onSave = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce(undefined);
  const onOpenChange = vi.fn();
  render(
    <PollSettingsDialog
      open
      onOpenChange={onOpenChange}
      closesAt={null}
      question="Question"
      allowAddingOptions={false}
      onSave={onSave}
    />,
  );
  fireEvent.click(screen.getByRole("switch", { name: /Allow adding options/i }));
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  expect(onSave).toHaveBeenLastCalledWith({ closesAt: null, allowAddingOptions: true });
});
