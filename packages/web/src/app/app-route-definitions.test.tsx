// @vitest-environment jsdom

/**
 * The chat routes carry `key={location.pathname}`, so navigating between two topics
 * rebuilds the chat page rather than re-rendering it. Anything that has to survive a
 * conversation switch therefore cannot live in the page's own state — see
 * pages/chat/chat-page-conversation-view-memory.lib.ts.
 */
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Outlet, useLocation, useNavigate } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";

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
vi.mock("~/pages/inbox/inbox-page.ui", () => ({ InboxPage: () => <div>Inbox</div> }));

const { AuthenticatedAppRoutes } = await import("./app-route-definitions");

const FIRST_TOPIC = "/org/org-1/project/project-1/stream/stream-1/topic/topic-1";
const SECOND_TOPIC = "/org/org-1/project/project-1/stream/stream-1/topic/topic-2";
const PROFILE_HASH = "#user/33333333-3333-4333-8333-333333333333";

function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</output>
  );
}

function setProfileSession() {
  useWorkspaceAuthStore.setState({
    sessions: [
      {
        accountId: "account-1",
        instanceId: "instance-1",
        organizationId: "org-1",
        organizationOrigin: window.location.origin,
        projectId: "project-1",
        userUuid: "viewer-1",
        accessToken: "test-token",
        runtimeGeneration: 1,
        login: "viewer",
        profile: {
          uuid: "viewer-1",
          username: "viewer",
          firstName: null,
          lastName: null,
          email: null,
        },
      },
    ],
    currentAccountId: "account-1",
  });
}

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
    useWorkspaceAuthStore.setState({ sessions: [], currentAccountId: null });
  });

  it.each(["/", "/org/org-1", "/org/org-1/project/project-1/messenger"])(
    "keeps the selected profile through the %s redirect",
    async (path) => {
      setProfileSession();
      render(
        <MemoryRouter initialEntries={[`${path}${PROFILE_HASH}`]}>
          <React.Suspense fallback={null}>
            <LocationProbe />
            <AuthenticatedAppRoutes defaultMessengerRoute="/org/org-1/project/project-1/messenger" />
          </React.Suspense>
        </MemoryRouter>,
      );
      await waitFor(() =>
        expect(screen.getByTestId("location")).toHaveTextContent(
          `/org/org-1/project/project-1/inbox${PROFILE_HASH}`,
        ),
      );
    },
  );

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
