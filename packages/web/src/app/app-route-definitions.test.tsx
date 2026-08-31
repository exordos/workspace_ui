// @vitest-environment jsdom

/**
 * The chat routes carry `key={location.pathname}`, so navigating between two topics
 * rebuilds the chat page rather than re-rendering it. Anything that has to survive a
 * conversation switch therefore cannot live in the page's own state — see
 * pages/chat/chat-page-conversation-view-memory.lib.ts.
 */
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Outlet, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const chatPageMounts = vi.hoisted(() => ({ count: 0 }));

vi.mock("~/pages/chat/chat-page.ui", () => ({
  ChatPage: () => {
    React.useEffect(() => {
      chatPageMounts.count += 1;
    }, []);
    return <div data-testid="chat-page" />;
  },
  FavoritesPage: () => <div data-testid="favorites-page" />,
}));

vi.mock("~/widgets/layout/layout.ui", () => ({
  Layout: () => <Outlet />,
}));

const { AuthenticatedAppRoutes } = await import("./app-route-definitions");

const FIRST_TOPIC = "/org/org-1/project/project-1/stream/stream-1/topic/topic-1";
const SECOND_TOPIC = "/org/org-1/project/project-1/stream/stream-1/topic/topic-2";

const NavigateToSecondTopic: React.FC = () => {
  const navigate = useNavigate();
  return (
    <button type="button" data-testid="switch-topic" onClick={() => navigate(SECOND_TOPIC)}>
      switch
    </button>
  );
};

describe("AuthenticatedAppRoutes", () => {
  beforeEach(() => {
    chatPageMounts.count = 0;
  });

  it("rebuilds the chat page when the topic route changes", async () => {
    render(
      <MemoryRouter initialEntries={[FIRST_TOPIC]}>
        <React.Suspense fallback={null}>
          <NavigateToSecondTopic />
          <AuthenticatedAppRoutes defaultMessengerRoute={FIRST_TOPIC} />
        </React.Suspense>
      </MemoryRouter>,
    );

    await screen.findByTestId("chat-page");
    expect(chatPageMounts.count).toBe(1);

    screen.getByTestId("switch-topic").click();

    await waitFor(() => expect(chatPageMounts.count).toBe(2));
  });
});
