import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "~/test/render";
import { ChatDirectHeader } from "./chat-header-direct.ui";

describe("ChatDirectHeader", () => {
  it("shows typing status for the partner when the typing flag is set", () => {
    renderWithProviders(
      <ChatDirectHeader
        partner={{ name: "Alice", avatarUrl: null, presenceState: "active", isTyping: true }}
      />,
    );

    expect(screen.getByText(/typing|печатает/i)).toBeInTheDocument();
    expect(screen.queryByText(/^typing$/)).not.toBeInTheDocument();
  });

  it("falls back to presence status when the typing flag is absent", () => {
    renderWithProviders(
      <ChatDirectHeader partner={{ name: "Alice", avatarUrl: null, presenceState: "active" }} />,
    );

    expect(screen.getByText(/online|в сети/i)).toBeInTheDocument();
  });

  it("renders an emoji-only custom status", () => {
    renderWithProviders(
      <ChatDirectHeader
        partner={{
          name: "Alice",
          avatarUrl: null,
          presenceState: "active",
          customStatus: ":scam:",
        }}
      />,
    );

    expect(screen.getByText(":scam:")).toBeInTheDocument();
    expect(screen.queryByText(/online|в сети/i)).not.toBeInTheDocument();
  });

  it("shows the deactivated label instead of presence for a deactivated account", () => {
    renderWithProviders(
      <ChatDirectHeader
        partner={{
          name: "Alice",
          avatarUrl: null,
          presenceState: "active",
          isAccountDeactivated: true,
        }}
      />,
    );

    expect(screen.getByText(/deactivated|заблокирован/i)).toBeInTheDocument();
    expect(screen.queryByText(/online|в сети/i)).not.toBeInTheDocument();
  });

  it("never shows channel participant counters", () => {
    renderWithProviders(
      <ChatDirectHeader partner={{ name: "Alice", avatarUrl: null, presenceState: "active" }} />,
    );

    expect(screen.queryByText(/participant|участник/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/online:|в сети,/i)).not.toBeInTheDocument();
  });

  it("opens the partner profile from a click anywhere on the header block", () => {
    const onOpenPartnerProfile = vi.fn();

    renderWithProviders(
      <ChatDirectHeader
        partner={{ name: "Alice", avatarUrl: null, presenceState: "active" }}
        onOpenPartnerProfile={onOpenPartnerProfile}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open profile: alice|профиль: alice/i }));

    expect(onOpenPartnerProfile).toHaveBeenCalledTimes(1);
  });

  it("does not expose the header block as a button without a profile handler", () => {
    renderWithProviders(
      <ChatDirectHeader partner={{ name: "Alice", avatarUrl: null, presenceState: "active" }} />,
    );

    expect(
      screen.queryByRole("button", { name: /open profile: alice|профиль: alice/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the call action next to the right panel toggle", () => {
    const onCallClick = vi.fn();

    renderWithProviders(
      <ChatDirectHeader
        partner={{ name: "Alice", avatarUrl: null, presenceState: "active" }}
        onCallClick={onCallClick}
        onToggleRightPanel={vi.fn()}
      />,
    );

    const callButton = screen.getByRole("button", { name: /^(call|позвонить)$/i });
    const panelButton = screen.getByRole("button", { name: /hide panel|скрыть панель/i });

    fireEvent.click(callButton);

    expect(onCallClick).toHaveBeenCalledTimes(1);
    expect(callButton.parentElement).toBe(panelButton.parentElement);
  });

  it("hides the call action without a handler", () => {
    renderWithProviders(
      <ChatDirectHeader partner={{ name: "Alice", avatarUrl: null, presenceState: "active" }} />,
    );

    expect(screen.queryByRole("button", { name: /^(call|позвонить)$/i })).not.toBeInTheDocument();
  });

  it("uses rounded top shell, compact metadata typography and topbar-aligned height", () => {
    renderWithProviders(
      <ChatDirectHeader partner={{ name: "Alice", avatarUrl: null, presenceState: "active" }} />,
    );

    const header = screen.getByText("Alice").closest("header");
    const status = screen.getByText(/online|в сети/i);

    expect(header).toHaveClass("rounded-lg");
    expect(header).toHaveClass("py-2");
    expect(status).toHaveClass("text-xs");
  });
});
