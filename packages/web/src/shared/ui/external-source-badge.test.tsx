import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import { ExternalSourceBadge } from "./external-source-badge";

describe("ExternalSourceBadge", () => {
  it("renders provider label for external messenger source", () => {
    render(<ExternalSourceBadge sourceName="zulip" />);

    const badge = screen.getByLabelText(t("source.externalFrom", { source: "Zulip" }));
    expect(badge).toHaveTextContent("Zulip");
  });

  it("does not render for native or absent source", () => {
    const { container, rerender } = render(<ExternalSourceBadge sourceName="native" />);
    expect(container).toBeEmptyDOMElement();

    rerender(<ExternalSourceBadge />);
    expect(container).toBeEmptyDOMElement();
  });

  it("prefers canonical provider and delivery metadata", () => {
    render(
      <ExternalSourceBadge
        sourceName="zulip"
        provider={{
          kind: "zulip",
          accountUuid: "account-1",
          externalId: "42",
          capabilities: {},
        }}
        delivery={{
          externalOperationUuid: "operation-1",
          status: "failed",
          safeError: "Manual reconciliation required",
          canRetry: true,
          canDiscard: true,
          duplicateRisk: false,
          retryRequiresConfirmation: false,
          originalUrl: null,
          reconciliationReason: null,
          updatedAt: "2026-07-17T12:00:00Z",
        }}
      />,
    );

    const badge = screen.getByTestId("external-source-zulip");
    expect(badge).toHaveTextContent("Zulip");
    expect(badge).toHaveAttribute("title", expect.stringContaining("Manual reconciliation"));
  });

  it("opens account, status, and safe original details from the keyboard-accessible badge", () => {
    render(
      <ExternalSourceBadge
        sourceName="zulip"
        source={{
          kind: "zulip",
          original_url: "https://zulip.example.com/#narrow/channel/42",
        }}
        provider={{
          kind: "zulip",
          accountUuid: "11111111-1111-4111-8111-111111111111",
          externalId: "42",
          capabilities: {},
          deliveryClass: "live",
        }}
      />,
    );

    const trigger = screen.getByLabelText(t("source.externalFrom", { source: "Zulip" }));
    expect(trigger.tagName).toBe("SUMMARY");
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(trigger);

    const popover = screen.getByRole("dialog", { name: "Zulip connection details" });
    expect(popover).toHaveTextContent("11111111-1111-4111-8111-111111111111");
    expect(popover).toHaveTextContent("Live synchronization");
    expect(screen.getByTestId("external-source-zulip-open-original")).toHaveAttribute(
      "href",
      "https://zulip.example.com/#narrow/channel/42",
    );
  });
});
