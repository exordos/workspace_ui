import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import type { Delivery, ProviderSummary } from "~/shared/types/provider-delivery";
import { ProviderDeliveryBadge } from "./provider-delivery-badge";

const provider: ProviderSummary = {
  kind: "zulip",
  accountUuid: "account-1",
  externalId: "42",
  capabilities: {},
};

function delivery(status: Delivery["status"], safeError: string | null = null): Delivery {
  return {
    externalOperationUuid: "operation-1",
    status,
    safeError,
    canRetry: status === "failed" || status === "manual_reconciliation_required",
    canDiscard: status === "failed" || status === "manual_reconciliation_required",
    duplicateRisk: status === "manual_reconciliation_required",
    retryRequiresConfirmation: status === "manual_reconciliation_required",
    originalUrl: null,
    reconciliationReason: null,
    updatedAt: "2026-07-15T10:00:00Z",
  };
}

describe("ProviderDeliveryBadge", () => {
  it.each([
    ["pending", "text-accent"],
    ["delivered", "text-call-green"],
    ["failed", "text-notice-base"],
  ] as const)("renders an accessible %s state with semantic color", (status, colorClass) => {
    render(<ProviderDeliveryBadge provider={provider} delivery={delivery(status)} />);

    const badge = screen.getByLabelText(t(`providerDelivery.${status}`, { provider: "Zulip" }));
    expect(badge).toHaveTextContent("Zulip");
    expect(badge).toHaveClass(colorClass);
    fireEvent.click(badge);
    expect(screen.getByRole("dialog", { name: "Zulip connection details" })).toHaveTextContent(
      "account-1",
    );
  });

  it("exposes a safe delivery error in the tooltip", () => {
    render(
      <ProviderDeliveryBadge
        provider={provider}
        delivery={delivery("failed", "Mailbox is unavailable")}
      />,
    );

    expect(screen.getByTestId("provider-delivery-failed")).toHaveAttribute(
      "title",
      expect.stringContaining("Mailbox is unavailable"),
    );
  });

  it("does not render when delivery does not apply", () => {
    const { container } = render(<ProviderDeliveryBadge provider={null} delivery={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders a provider-neutral kind without treating it as Zulip", () => {
    render(
      <ProviderDeliveryBadge
        provider={{ ...provider, kind: "mail.imap" }}
        delivery={delivery("delivered")}
      />,
    );

    expect(
      screen.getByLabelText(
        t("providerDelivery.delivered", {
          provider: "mail.imap",
        }),
      ),
    ).toHaveTextContent("mail.imap");
  });

  it("renders manual reconciliation as an interactive popover with original link", () => {
    render(
      <ProviderDeliveryBadge
        provider={provider}
        delivery={{
          ...delivery("manual_reconciliation_required", "Provider history is unavailable"),
          originalUrl: "https://zulip.example.com/#narrow/channel/42",
          reconciliationReason: "provider_history_unavailable",
        }}
      />,
    );

    expect(
      screen.getByTestId("provider-delivery-manual-reconciliation-required"),
    ).toHaveTextContent("Zulip");
    expect(screen.getByTestId("provider-delivery-open-original")).toHaveAttribute(
      "href",
      "https://zulip.example.com/#narrow/channel/42",
    );
  });

  it("does not expose a non-HTTP provider URL", () => {
    render(
      <ProviderDeliveryBadge
        provider={provider}
        delivery={{
          ...delivery("manual_reconciliation_required"),
          originalUrl: ["java", "script:alert(1)"].join(""),
        }}
      />,
    );

    expect(screen.queryByTestId("provider-delivery-open-original")).not.toBeInTheDocument();
  });
});
