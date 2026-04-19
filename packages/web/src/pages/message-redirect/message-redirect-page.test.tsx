import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatListStore } from "~/entities/chat-list/chat-list.model";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { MessageRedirectPage } from "./message-redirect-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());
const fetchMessageById = vi.hoisted(() => vi.fn());
const getCurrentUser = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

vi.mock("~/shared/api/zulip-messages", () => ({
  fetchMessageById,
}));

vi.mock("~/shared/api/zulip-users", () => ({
  getCurrentUser,
}));

describe("MessageRedirectPage", () => {
  afterEach(() => {
    navigateSpy.mockReset();
    fetchMessageById.mockReset();
    getCurrentUser.mockReset();
    useInstancesStore.setState({ instances: [], currentInstanceId: null });
    useChatListStore.setState({ currentUserId: null });
  });

  it("redirects to login with realm prefill when no saved instance matches", async () => {
    useInstancesStore.setState({
      instances: [
        { id: "1", realm: "https://zulip.example.com", email: "a@test.com", apiKey: "k" },
      ],
      currentInstanceId: "1",
    });

    render(
      <MemoryRouter initialEntries={["/message/123?realm=https%3A%2F%2Fchat.example.com"]}>
        <Routes>
          <Route path="/message/:messageId" element={<MessageRedirectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith(
        "/login?realm=https%3A%2F%2Fchat.example.com&redirectTo=%2Fmessage%2F123%3Frealm%3Dhttps%253A%252F%252Fchat.example.com",
        {
          replace: true,
        },
      );
    });
    expect(fetchMessageById).not.toHaveBeenCalled();
  });

  it("switches to the matched saved instance before resolving the final route", async () => {
    useInstancesStore.setState({
      instances: [
        { id: "1", realm: "https://zulip.example.com", email: "a@test.com", apiKey: "k1" },
        { id: "2", realm: "https://chat.example.com", email: "b@test.com", apiKey: "k2" },
      ],
      currentInstanceId: "1",
    });
    useChatListStore.setState({ currentUserId: 7 });
    fetchMessageById.mockResolvedValue({
      id: 123,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      channel: "engineering",
      display_recipient: "engineering",
      subject: "bugs",
      content: "hello",
      timestamp: 1710000000,
    });
    getCurrentUser.mockResolvedValue({ user_id: 7, full_name: "You", email: "you@test.com" });

    render(
      <MemoryRouter initialEntries={["/message/123?realm=https%3A%2F%2Fchat.example.com"]}>
        <Routes>
          <Route path="/message/:messageId" element={<MessageRedirectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(useInstancesStore.getState().currentInstanceId).toBe("2");
    });
    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith("/stream/10-engineering/topic/bugs?msg=123", {
        replace: true,
      });
    });
  });

  it("fails fast for non-decimal message id params", async () => {
    useInstancesStore.setState({
      instances: [
        { id: "1", realm: "https://zulip.example.com", email: "a@test.com", apiKey: "k" },
      ],
      currentInstanceId: "1",
    });
    useChatListStore.setState({ currentUserId: 7 });
    fetchMessageById.mockResolvedValue({
      id: 123,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      channel: "engineering",
      display_recipient: "engineering",
      subject: "bugs",
      content: "hello",
      timestamp: 1710000000,
    });

    render(
      <MemoryRouter initialEntries={["/message/1e3"]}>
        <Routes>
          <Route path="/message/:messageId" element={<MessageRedirectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Failed to load page")).toBeInTheDocument();
    });
    expect(fetchMessageById).not.toHaveBeenCalled();
    expect(getCurrentUser).not.toHaveBeenCalled();
  });

  it("shows access denied error when target message is unavailable", async () => {
    useInstancesStore.setState({
      instances: [
        { id: "1", realm: "https://zulip.example.com", email: "a@test.com", apiKey: "k" },
      ],
      currentInstanceId: "1",
    });
    useChatListStore.setState({ currentUserId: 7 });
    fetchMessageById.mockResolvedValue(null);

    render(
      <MemoryRouter initialEntries={["/message/123"]}>
        <Routes>
          <Route path="/message/:messageId" element={<MessageRedirectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("No access to the original message or chat")).toBeInTheDocument();
    });
  });

  it("ignores invalid realm query values and resolves within current instance", async () => {
    useInstancesStore.setState({
      instances: [
        { id: "1", realm: "https://zulip.example.com", email: "a@test.com", apiKey: "k" },
      ],
      currentInstanceId: "1",
    });
    useChatListStore.setState({ currentUserId: 7 });
    fetchMessageById.mockResolvedValue({
      id: 123,
      sender_id: 42,
      sender_full_name: "Alice",
      stream_id: 10,
      channel: "engineering",
      display_recipient: "engineering",
      subject: "bugs",
      content: "hello",
      timestamp: 1710000000,
    });

    render(
      <MemoryRouter initialEntries={["/message/123?realm=javascript%3Aalert(1)"]}>
        <Routes>
          <Route path="/message/:messageId" element={<MessageRedirectPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(navigateSpy).toHaveBeenCalledWith("/stream/10-engineering/topic/bugs?msg=123", {
        replace: true,
      });
    });
    expect(fetchMessageById).toHaveBeenCalledWith(123);
    expect(navigateSpy.mock.calls.some(([path]) => String(path).startsWith("/login?"))).toBe(false);
  });
});
