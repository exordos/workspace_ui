import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import { EncryptedChatPreview } from "./encrypted-chat-preview.ui";

describe("EncryptedChatPreview", () => {
  it("returns focus to the opener when the panel closes", () => {
    render(<EncryptedChatPreview />);
    expect(screen.getAllByRole("complementary", { name: t("a11y.infoPanel") })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: t("common.close") })).toHaveLength(1);
    const close = screen.getByRole("button", { name: t("common.close") });
    close.focus();
    fireEvent.click(close);
    expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("e2ee.openPanel") })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: t("e2ee.openPanel") }));
    expect(screen.getByRole("complementary", { name: t("a11y.infoPanel") })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: t("info.channelInfo"), level: 2 }),
    ).toBeInTheDocument();
  });

  it("disables grants without a private key while preserving permitted rejection", () => {
    render(<EncryptedChatPreview />);
    fireEvent.click(screen.getByRole("checkbox", { name: t("e2ee.previewKey") }));
    const panel = within(screen.getByRole("complementary"));
    fireEvent.click(panel.getByRole("button", { name: t("settings.settings") }));
    fireEvent.click(panel.getByRole("button", { name: t("e2ee.keyTitle") }));
    expect(panel.getByRole("heading", { name: t("e2ee.keyTitle"), level: 2 })).toBeInTheDocument();
    fireEvent.click(panel.getByRole("button", { name: t("e2ee.incomingTitle", { count: 4 }) }));
    for (const grant of panel.getAllByRole("button", {
      name: t("e2ee.grantRequest", { name: t("e2ee.previewPerson") }),
    })) {
      expect(grant).toBeDisabled();
    }
    expect(panel.queryByRole("button", { name: t("e2ee.rotateKey") })).not.toBeInTheDocument();
    expect(panel.getByRole("button", { name: t("e2ee.grantAll") })).toBeDisabled();
    expect(
      panel.getAllByRole("button", {
        name: t("e2ee.rejectRequest", { name: t("e2ee.previewPerson") }),
      })[0],
    ).toBeEnabled();
  });

  it("uses one shared drawer header for screen navigation and restores the previous screen", () => {
    render(<EncryptedChatPreview />);
    const panel = within(screen.getByRole("complementary", { name: t("a11y.infoPanel") }));
    expect(panel.queryByRole("button", { name: t("common.back") })).not.toBeInTheDocument();
    fireEvent.click(panel.getByRole("button", { name: t("settings.settings") }));
    expect(
      panel.getByRole("heading", { name: t("channel.editChannel"), level: 2 }),
    ).toBeInTheDocument();
    fireEvent.click(panel.getByRole("button", { name: t("e2ee.keyTitle") }));
    expect(panel.getByRole("heading", { name: t("e2ee.keyTitle"), level: 2 })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: t("common.close") })).toHaveLength(1);
    fireEvent.click(panel.getByRole("button", { name: t("common.back") }));
    expect(
      panel.getByRole("heading", { name: t("channel.editChannel"), level: 2 }),
    ).toBeInTheDocument();
    fireEvent.click(panel.getByRole("button", { name: t("common.back") }));
    expect(
      panel.getByRole("heading", { name: t("info.channelInfo"), level: 2 }),
    ).toBeInTheDocument();
    expect(panel.queryByRole("button", { name: t("common.back") })).not.toBeInTheDocument();
  });

  it("reports unavailable operations and never presents a grant as unlocked access", () => {
    render(<EncryptedChatPreview />);
    fireEvent.click(screen.getByRole("button", { name: t("e2ee.grantAccess") }));
    expect(screen.getByText(t("e2ee.previewUnavailable"))).toBeInTheDocument();
    expect(
      screen
        .getAllByText(t("e2ee.lockedTitle"))
        .some((element) => element.classList.contains("sr-only")),
    ).toBe(true);
    expect(screen.queryByText(t("e2ee.lockedDescription"))).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox", { name: t("e2ee.previewState") }), {
      target: { value: "loading" },
    });
    expect(screen.queryByRole("button", { name: t("e2ee.requestAccess") })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t("e2ee.grantAccess") })).toBeDisabled();
  });
});
