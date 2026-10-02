import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import { EncryptedChatPreview } from "./encrypted-chat-preview.ui";

describe("EncryptedChatPreview", () => {
  it("returns focus to the opener when the panel closes", () => {
    render(<EncryptedChatPreview />);
    const close = screen.getByRole("button", { name: t("common.close") });
    close.focus();
    fireEvent.click(close);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("e2ee.openPanel") })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: t("e2ee.openPanel") }));
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });

  it("disables grants without a private key while preserving permitted rejection", () => {
    render(<EncryptedChatPreview />);
    fireEvent.click(screen.getByRole("checkbox", { name: t("e2ee.previewKey") }));
    const panel = within(screen.getByRole("complementary"));
    for (const grant of panel.getAllByRole("button", {
      name: t("e2ee.grantRequest", { name: t("e2ee.previewPerson") }),
    })) {
      expect(grant).toBeDisabled();
    }
    expect(panel.getByRole("button", { name: t("e2ee.rotateKey") })).toBeDisabled();
    expect(panel.getByRole("button", { name: t("e2ee.grantAll") })).toBeDisabled();
    expect(
      panel.getAllByRole("button", {
        name: t("e2ee.rejectRequest", { name: t("e2ee.previewPerson") }),
      })[0],
    ).toBeEnabled();
  });

  it("reports unavailable operations and never presents a grant as unlocked access", () => {
    render(<EncryptedChatPreview />);
    fireEvent.click(screen.getByRole("button", { name: t("e2ee.grantAccess") }));
    expect(screen.getByText(t("e2ee.previewUnavailable"))).toBeInTheDocument();
    expect(screen.getByText(t("e2ee.lockedDescription"))).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: t("e2ee.previewState") }), {
      target: { value: "loading" },
    });
    expect(screen.getByRole("button", { name: t("e2ee.requestAccess") })).toBeDisabled();
    expect(screen.getByRole("button", { name: t("e2ee.grantAccess") })).toBeDisabled();
  });
});
