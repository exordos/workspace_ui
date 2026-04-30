import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUsersStore } from "~/entities/user/user.model";
import { createMessage, createUser } from "~/test/factories";
import { SearchModal } from "./search-modal.ui";

const fetchMessages = vi.hoisted(() => vi.fn());

vi.mock("~/shared/api/zulip-messages", async () => {
  const actual = await vi.importActual<typeof import("~/shared/api/zulip-messages")>(
    "~/shared/api/zulip-messages",
  );
  return {
    ...actual,
    fetchMessages,
  };
});

describe("SearchModal open-in-chat action", () => {
  afterEach(() => {
    fetchMessages.mockReset();
    useUsersStore.getState().clear();
  });

  it("opens selected result in chat from context action", async () => {
    const onSelectMessage = vi.fn();
    const onOpenChange = vi.fn();
    const result = createMessage({
      id: 55,
      sender_id: 77,
      sender_full_name: "Alice",
      stream_id: 10,
      channel: "engineering",
      subject: "bugs",
      content: "<p>Search target</p>",
      type: "stream",
      display_recipient: "engineering",
    });
    fetchMessages.mockResolvedValue([result]);

    render(<SearchModal open onOpenChange={onOpenChange} onSelectMessage={onSelectMessage} />);

    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "target" },
    });

    await waitFor(() => {
      expect(fetchMessages).toHaveBeenCalledWith(undefined, undefined, "target");
      expect(screen.getByText("Search target")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open in chat" }));

    expect(onSelectMessage).toHaveBeenCalledWith(expect.objectContaining({ id: 55 }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("matches users by email and opens dm from user result", async () => {
    const onSelectMessage = vi.fn();
    const onSelectUser = vi.fn();
    const onOpenChange = vi.fn();
    fetchMessages.mockResolvedValue([]);
    useUsersStore.getState().mergeUser(
      createUser({
        user_id: 42,
        full_name: "Alice",
        email: "alice@example.com",
        presence: { status: "active", timestamp: Math.floor(Date.now() / 1000) },
      }),
    );

    render(
      <SearchModal
        open
        onOpenChange={onOpenChange}
        onSelectMessage={onSelectMessage}
        onSelectUser={onSelectUser}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "alice@example.com" },
    });

    await waitFor(() => {
      expect(fetchMessages).toHaveBeenCalledWith(undefined, undefined, "alice@example.com");
      expect(
        screen.getByRole("button", { name: /Alice \(alice@example\.com\)/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole("status", { name: /online/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Alice \(alice@example\.com\)/i }));

    expect(onSelectUser).toHaveBeenCalledWith(42);
    expect(onSelectMessage).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("filters message search results by stream sender and date", async () => {
    const onSelectMessage = vi.fn();
    const onOpenChange = vi.fn();
    const streamHit = createMessage({
      id: 101,
      sender_id: 10,
      sender_full_name: "Alice Dev",
      stream_id: 15,
      channel: "engineering",
      subject: "release",
      content: "<p>Release checklist</p>",
      timestamp: Math.floor(new Date("2026-03-16T11:00:00.000Z").getTime() / 1000),
      type: "stream",
      display_recipient: "engineering",
    });
    const streamMiss = createMessage({
      id: 102,
      sender_id: 11,
      sender_full_name: "Bob Design",
      stream_id: 21,
      channel: "design",
      subject: "release",
      content: "<p>Design release notes</p>",
      timestamp: Math.floor(new Date("2026-03-15T11:00:00.000Z").getTime() / 1000),
      type: "stream",
      display_recipient: "design",
    });
    fetchMessages.mockResolvedValue([streamHit, streamMiss]);

    render(<SearchModal open onOpenChange={onOpenChange} onSelectMessage={onSelectMessage} />);

    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "release" },
    });

    await waitFor(() => {
      expect(fetchMessages).toHaveBeenCalledWith(undefined, undefined, "release");
      expect(screen.getByText("Release checklist")).toBeInTheDocument();
      expect(screen.getByText("Design release notes")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Stream"), {
      target: { value: "engineering" },
    });
    fireEvent.change(screen.getByPlaceholderText("Sender"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: "2026-03-16" },
    });

    expect(screen.getByText("Release checklist")).toBeInTheDocument();
    expect(screen.queryByText("Design release notes")).not.toBeInTheDocument();
  });

  it("uses subtle focus styling variants for search inputs", () => {
    render(<SearchModal open onOpenChange={() => {}} onSelectMessage={() => {}} />);

    const queryInput = screen.getByPlaceholderText("Search");
    const queryInputFrame = queryInput.closest("div");
    expect(queryInputFrame).not.toBeNull();
    expect(queryInputFrame).toHaveClass("focus-within:outline-none");
    expect(queryInputFrame).toHaveClass("focus-within:bg-bg-elevated");
    expect(queryInputFrame).toHaveClass("focus-within:border-accent-soft");
    expect(queryInput).toHaveClass("focus-visible:!outline-none");

    const streamInput = screen.getByPlaceholderText("Stream");
    expect(streamInput).toHaveClass("outline-none");
    expect(streamInput).toHaveClass("focus-visible:bg-bg-elevated");

    const dateInput = screen.getByLabelText("Date");
    expect(dateInput).toHaveClass("outline-none");
    expect(dateInput).toHaveClass("focus-visible:bg-bg-elevated");
  });

  it("keeps user name fixed and truncates email in user search results", async () => {
    fetchMessages.mockResolvedValue([]);
    useUsersStore.getState().mergeUser(
      createUser({
        user_id: 97,
        full_name: "Alexandria Montgomery",
        email: "alexandria.montgomery.with.really.long.email@example-corporation-domain.com",
        presence: { status: "active", timestamp: Math.floor(Date.now() / 1000) },
      }),
    );

    render(<SearchModal open onOpenChange={() => {}} onSelectMessage={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("Search"), {
      target: { value: "alexandria" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Alexandria Montgomery/i })).toBeInTheDocument();
    });

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
