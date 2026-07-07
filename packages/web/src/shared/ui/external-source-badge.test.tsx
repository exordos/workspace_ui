import { render, screen } from "@testing-library/react";
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
});
