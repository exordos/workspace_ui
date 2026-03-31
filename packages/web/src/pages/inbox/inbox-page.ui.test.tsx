import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInboxStore } from "~/entities/inbox/inbox.model";
import { InboxPage } from "./inbox-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());
const fetchInboxEntries = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("~/entities/inbox/inbox.api", async () => {
  const actual = await vi.importActual<typeof import("~/entities/inbox/inbox.api")>(
    "~/entities/inbox/inbox.api",
  );
  return {
    ...actual,
    fetchInboxEntries,
  };
});

describe("InboxPage styling contract", () => {
  afterEach(() => {
    navigateSpy.mockReset();
    fetchInboxEntries.mockReset();
    useInboxStore.getState().clear();
  });

  it("renders inbox rows as themed cards for all palettes", async () => {
    fetchInboxEntries.mockResolvedValue([
      {
        key: "dm:42",
        streamId: null,
        streamName: null,
        topic: null,
        senderId: 42,
        senderName: "Alice",
        dmSlug: "42",
        unreadCount: 2,
        lastMessageTimestamp: 10,
        messageIds: [1, 2],
      },
      {
        key: "stream:10:release",
        streamId: 10,
        streamName: "engineering",
        topic: "release",
        senderId: null,
        senderName: null,
        dmSlug: null,
        unreadCount: 1,
        lastMessageTimestamp: 9,
        messageIds: [3],
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/inbox"]}>
        <Routes>
          <Route path="/inbox" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Alice")).toBeInTheDocument();
    });

    const dmRow = screen.getByText("Alice").closest("button");
    const streamRow = screen.getByText("#engineering · release").closest("button");

    expect(dmRow).toHaveClass("rounded-xl");
    expect(dmRow).toHaveClass("border");
    expect(dmRow).toHaveClass("border-border-subtle");
    expect(dmRow).toHaveClass("bg-bg-elevated/50");

    expect(streamRow).toHaveClass("rounded-xl");
    expect(streamRow).toHaveClass("border");
    expect(streamRow).toHaveClass("border-border-subtle");
    expect(streamRow).toHaveClass("bg-bg-elevated/50");
  });
});
