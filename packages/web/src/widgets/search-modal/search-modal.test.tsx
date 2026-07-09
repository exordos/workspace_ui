import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import { t } from "~/i18n/i18n";
import { createUser } from "~/test/factories";
import { useSearchModalStore } from "./search-modal.model";
import { SearchModal } from "./search-modal.ui";

describe("SearchModal open-in-chat action", () => {
  afterEach(() => {
    useUsersStore.getState().clear();
    useSearchModalStore.getState().reset();
  });

  it("searches Workspace users locally", () => {
    const onSelectUserUuid = vi.fn(() => true);
    const onOpenChange = vi.fn();
    useUsersStore.getState().upsertUser(
      createUser({
        uuid: "a225223c-637c-4afa-918f-5f2798b9305f",
        username: "alice.workspace",
        displayName: "Alice Workspace",
        email: "alice.workspace@example.com",
        status: "active",
      }),
    );

    render(
      <SearchModal
        open
        mode="workspace"
        onOpenChange={onOpenChange}
        onSelectUserUuid={onSelectUserUuid}
      />,
    );

    const searchInput = screen.getByPlaceholderText(t("search.search"));
    expect(searchInput).not.toBeDisabled();
    expect(screen.queryByPlaceholderText(t("search.filterStream"))).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "alice.workspace" } });

    expect(screen.queryByText("Search target")).not.toBeInTheDocument();
    const result = screen.getByRole("button", { name: /Alice Workspace/i });
    expect(result).toBeInTheDocument();

    fireEvent.click(result);

    expect(onSelectUserUuid).toHaveBeenCalledWith("a225223c-637c-4afa-918f-5f2798b9305f");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("matches Workspace users by email and selects their UUID", () => {
    const onSelectUserUuid = vi.fn(() => true);
    const onOpenChange = vi.fn();
    useUsersStore.getState().upsertUser(
      createUser({
        uuid: "e877964e-8f29-4b4f-b41e-90c69365b871",
        username: "alice.email",
        full_name: "Alice",
        email: "alice@example.com",
        presence: { status: "active", timestamp: Math.floor(Date.now() / 1000) },
      }),
    );

    render(
      <SearchModal
        open
        mode="workspace"
        onOpenChange={onOpenChange}
        onSelectUserUuid={onSelectUserUuid}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "alice@example.com" },
    });

    expect(
      screen.getByRole("button", { name: /Alice \(alice@example\.com\)/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status", { name: /online/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Alice \(alice@example\.com\)/i }));

    expect(onSelectUserUuid).toHaveBeenCalledWith("e877964e-8f29-4b4f-b41e-90c69365b871");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders emoji-only Workspace status in user results without falling back to email", () => {
    useUsersStore.getState().upsertUser(
      createUser({
        user_id: 43,
        full_name: "Coffee User",
        email: "coffee@example.com",
        statusEmoji: "☕",
        statusText: null,
      }),
    );

    render(<SearchModal open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "coffee" },
    });

    expect(screen.getByRole("button", { name: /Coffee User/i })).toBeInTheDocument();

    expect(screen.getByText("☕")).toBeInTheDocument();
    expect(screen.queryByText("coffee@example.com")).not.toBeInTheDocument();
  });

  it("does not render legacy message filters", () => {
    render(<SearchModal open onOpenChange={() => {}} />);

    const queryInput = screen.getByPlaceholderText("Search");
    const queryInputFrame = queryInput.closest("label");
    expect(queryInputFrame).not.toBeNull();
    expect(queryInputFrame).toHaveClass("focus-within:outline-none");
    expect(queryInputFrame).toHaveClass("focus-within:bg-bg-elevated");
    expect(queryInputFrame).toHaveClass("focus-within:border-accent-soft");
    expect(queryInput).toHaveClass("focus-visible:!outline-none");

    expect(screen.queryByPlaceholderText("Stream")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Sender")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Date")).not.toBeInTheDocument();
  });

  it("shows empty state instead of legacy message results", () => {
    render(<SearchModal open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "release" },
    });

    expect(screen.getByText("No results found")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open in chat" })).not.toBeInTheDocument();
  });

  it("keeps user name fixed and truncates email in user search results", () => {
    useUsersStore.getState().upsertUser(
      createUser({
        user_id: 97,
        full_name: "Alexandria Montgomery",
        email: "alexandria.montgomery.with.really.long.email@example-corporation-domain.com",
        presence: { status: "active", timestamp: Math.floor(Date.now() / 1000) },
      }),
    );

    render(<SearchModal open onOpenChange={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "alexandria" },
    });

    expect(screen.getByRole("button", { name: /Alexandria Montgomery/i })).toBeInTheDocument();

    const userName = screen.getByText("Alexandria Montgomery");
    expect(userName).toHaveClass("text-sm");
    expect(userName).toHaveClass("font-medium");
    const userEmail = screen.getByText(
      "alexandria.montgomery.with.really.long.email@example-corporation-domain.com",
    );
    expect(userEmail).toHaveClass("truncate");
    expect(userEmail).toHaveClass("text-[11px]");
    expect(userEmail).toHaveClass("text-text-secondary");
  });
});
