import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { RightPanelUserProfileDetails } from "./right-panel-user-profile-details.ui";

describe("RightPanelUserProfileDetails", () => {
  it("renders compact Figma-sized rows without uppercase section labels", () => {
    renderWithProviders(
      <RightPanelUserProfileDetails
        details={[
          {
            id: "userId",
            value: "a225223c-637c-4afa-918f-5f2798b9305f",
            isTemporarilyUnavailable: false,
          },
          {
            id: "phone",
            value: "Temporarily not connected",
            isTemporarilyUnavailable: true,
          },
        ]}
      />,
    );

    const list = screen.getByTestId("right-panel-user-profile-details");
    expect(list).toHaveClass("space-y-3");

    const userIdRow = screen.getByTestId("right-panel-profile-detail-userId");
    expect(userIdRow).toHaveClass("h-9");
    expect(userIdRow).toHaveClass("items-end");
    expect(userIdRow).not.toHaveClass("py-1.5");

    // Sentence-case label (not SectionLabel uppercase micro-caption)
    expect(screen.getByText(t("info.userId"))).toHaveClass("text-xs", "leading-4");
    expect(screen.getByText(t("info.userId")).className).not.toMatch(/uppercase/);

    expect(screen.getByText("a225223c-637c-4afa-918f-5f2798b9305f")).toHaveClass("leading-4");
    expect(screen.queryByRole("button", { name: t("message.copy") })).toBeInTheDocument();
    expect(
      screen.queryByTestId("right-panel-profile-detail-phone")?.querySelector("button"),
    ).toBeNull();
  });

  it("uses Figma icon names for timezone, local time, joined, and birthday", () => {
    const { container } = renderWithProviders(
      <RightPanelUserProfileDetails
        details={[
          { id: "timezone", value: "Europe / Moscow", isTemporarilyUnavailable: false },
          { id: "localTime", value: "12:49", isTemporarilyUnavailable: false },
          { id: "joined", value: "14 Feb 2026", isTemporarilyUnavailable: false },
          { id: "birthday", value: "-", isTemporarilyUnavailable: true },
        ]}
      />,
    );

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(4);

    expect(screen.getByTestId("right-panel-profile-detail-timezone")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-profile-detail-localTime")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-profile-detail-joined")).toBeInTheDocument();
    expect(screen.getByTestId("right-panel-profile-detail-birthday")).toBeInTheDocument();
  });

  it("renders every detail glyph at the shared 24px optical size", () => {
    renderWithProviders(
      <RightPanelUserProfileDetails
        details={[
          { id: "userId", value: "1", isTemporarilyUnavailable: false },
          { id: "email", value: "a@b.c", isTemporarilyUnavailable: false },
          { id: "phone", value: "-", isTemporarilyUnavailable: true },
          { id: "jobTitle", value: "-", isTemporarilyUnavailable: true },
          { id: "manager", value: "-", isTemporarilyUnavailable: true },
          { id: "role", value: "Участник", isTemporarilyUnavailable: false },
          { id: "accountType", value: "Человек", isTemporarilyUnavailable: false },
          { id: "accountStatus", value: "Активен", isTemporarilyUnavailable: false },
          { id: "timezone", value: "Europe / Moscow", isTemporarilyUnavailable: false },
          { id: "localTime", value: "12:00", isTemporarilyUnavailable: false },
          { id: "joined", value: "14 фев. 2026 г.", isTemporarilyUnavailable: false },
          { id: "birthday", value: "-", isTemporarilyUnavailable: true },
        ]}
      />,
    );

    const list = screen.getByTestId("right-panel-user-profile-details");
    const glyphs = list.querySelectorAll("li span.flex.h-8.w-8 svg");
    expect(glyphs).toHaveLength(12);
    for (const svg of glyphs) {
      expect(svg).toHaveAttribute("width", "24");
      expect(svg).toHaveAttribute("height", "24");
    }
  });
});
