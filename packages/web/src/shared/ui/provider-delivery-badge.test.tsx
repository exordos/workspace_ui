import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import type { Delivery, ProviderSummary } from "~/shared/types/provider-delivery";
import { ProviderDeliveryBadge } from "./provider-delivery-badge";

const provider: ProviderSummary = {
  uuid: "provider-1",
  name: "Mail.ru",
  kind: "mail",
};

function delivery(status: Delivery["status"], safeError: string | null = null): Delivery {
  return { status, safeError, updatedAt: "2026-07-15T10:00:00Z" };
}

describe("ProviderDeliveryBadge", () => {
  it.each([
    ["pending", "text-accent"],
    ["delivered", "text-call-green"],
    ["failed", "text-notice-base"],
  ] as const)("renders an accessible %s state with semantic color", (status, colorClass) => {
    render(<ProviderDeliveryBadge provider={provider} delivery={delivery(status)} />);

    const badge = screen.getByLabelText(t(`providerDelivery.${status}`, { provider: "Mail.ru" }));
    expect(badge).toHaveTextContent("Mail.ru");
    expect(badge).toHaveClass(colorClass);
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
});
