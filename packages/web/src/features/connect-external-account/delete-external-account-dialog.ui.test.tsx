import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";
import { DeleteExternalAccountDialog } from "./delete-external-account-dialog.ui";
import { useDeleteExternalAccount } from "./delete-external-account.hook";

vi.mock("./delete-external-account.hook", () => ({
  useDeleteExternalAccount: vi.fn(),
}));

const remove = vi.fn();

describe("DeleteExternalAccountDialog", () => {
  beforeEach(() => {
    remove.mockReset();
    vi.mocked(useDeleteExternalAccount).mockReturnValue({
      deleting: false,
      error: false,
      remove,
      reset: vi.fn(),
    });
  });

  it("requires an explicit confirmation before deletion", () => {
    renderWithProviders(
      <DeleteExternalAccountDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={null}
        accountUuid="external-account-1"
      />,
    );

    expect(
      screen.getByText(/imported chats and their history will also be deleted/i),
    ).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();

    const deleteButton = screen.getByRole("button", { name: /^delete connection$/i });
    expect(deleteButton).toHaveClass("bg-danger", "text-white");
    fireEvent.click(deleteButton);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("closes without sending a delete request when cancelled", () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <DeleteExternalAccountDialog
        open
        onOpenChange={onOpenChange}
        runtimeContext={null}
        accountUuid="external-account-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it("keeps the confirmation open and shows an honest failure", () => {
    vi.mocked(useDeleteExternalAccount).mockReturnValue({
      deleting: false,
      error: true,
      remove,
      reset: vi.fn(),
    });
    renderWithProviders(
      <DeleteExternalAccountDialog
        open
        onOpenChange={vi.fn()}
        runtimeContext={null}
        accountUuid="external-account-1"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not confirm that the connection was deleted/i,
    );
  });
});
