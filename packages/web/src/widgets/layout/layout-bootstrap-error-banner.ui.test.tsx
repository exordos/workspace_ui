import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { t } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { LayoutBootstrapErrorBanner } from "./layout-bootstrap-error-banner.ui";

describe("LayoutBootstrapErrorBanner", () => {
  it("renders nothing when error is null", () => {
    renderWithProviders(<LayoutBootstrapErrorBanner error={null} onRetry={vi.fn()} />);
    expect(screen.queryByTestId("bootstrap-error-banner")).not.toBeInTheDocument();
  });

  it("shows load failed message and invokes retry", () => {
    const onRetry = vi.fn();
    renderWithProviders(<LayoutBootstrapErrorBanner error="Network error" onRetry={onRetry} />);

    expect(screen.getByText(t("app.loadFailed"))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t("app.retry") }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
