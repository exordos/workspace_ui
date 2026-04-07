import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMessage } from "~/test/factories";
import { CallsPage } from "./calls-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());
const fetchAllMessagesPage = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("~/shared/api/zulip-messages", async () => {
  const actual = await vi.importActual<typeof import("~/shared/api/zulip-messages")>(
    "~/shared/api/zulip-messages",
  );
  return {
    ...actual,
    fetchAllMessagesPage,
  };
});

describe("CallsPage", () => {
  afterEach(() => {
    navigateSpy.mockReset();
    fetchAllMessagesPage.mockReset();
  });

  it("renders recent jitsi calls from message history", async () => {
    fetchAllMessagesPage.mockResolvedValue({
      messages: [
        createMessage({
          id: 1,
          content: "https://meet.jit.si/team-sync",
          stream_id: 10,
          display_recipient: "engineering",
          channel: "engineering",
          subject: "daily",
          timestamp: 200,
        }),
        createMessage({
          id: 2,
          content: "Regular message without call link",
          stream_id: 10,
          display_recipient: "engineering",
          channel: "engineering",
          subject: "daily",
          timestamp: 150,
        }),
      ],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/calls"]}>
        <Routes>
          <Route path="/calls" element={<CallsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/team sync/i)).toBeInTheDocument();
    });

    expect(screen.queryByText("Regular message without call link")).not.toBeInTheDocument();
    expect(fetchAllMessagesPage).toHaveBeenCalledWith("newest", 250);
  });

  it("opens selected call message in chat context", async () => {
    fetchAllMessagesPage.mockResolvedValue({
      messages: [
        createMessage({
          id: 77,
          content: "https://meet.jit.si/engineering-standup",
          stream_id: 10,
          display_recipient: "engineering",
          channel: "engineering",
          subject: "standup",
          timestamp: 200,
        }),
      ],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/calls"]}>
        <Routes>
          <Route path="/calls" element={<CallsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/engineering standup/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /open in chat/i }));

    expect(navigateSpy).toHaveBeenCalledWith("/stream/10-engineering/topic/standup?msg=77");
  });

  it("shows empty-state hint when there are no jitsi calls", async () => {
    fetchAllMessagesPage.mockResolvedValue({
      messages: [],
      foundOldest: true,
    });

    render(
      <MemoryRouter initialEntries={["/calls"]}>
        <Routes>
          <Route path="/calls" element={<CallsPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/no recent jitsi calls yet/i)).toBeInTheDocument();
    });
  });
});
