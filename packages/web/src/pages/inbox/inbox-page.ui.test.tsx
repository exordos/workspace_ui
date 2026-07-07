import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import type { MessengerStream, MessengerTopic } from "~/entities/messenger/messenger.types";
import { useUsersStore } from "~/entities/user/user.model";
import type { User } from "~/entities/user/user.types";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  workspaceInboxRoute,
  workspaceMessengerStreamRoute,
  workspaceMessengerTopicRoute,
} from "~/shared/lib/workspace-messenger-route.lib";
import { InboxPage } from "./inbox-page.ui";
import type * as ReactRouterDom from "react-router-dom";

const navigateSpy = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof ReactRouterDom>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

const ORGANIZATION_ID = "workspace.example.com";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const CURRENT_USER_UUID = "11111111-1111-4111-8111-111111111111";
const DIRECT_USER_UUID = "33333333-3333-4333-8333-333333333333";
const DIRECT_STREAM_UUID = "44444444-4444-4444-8444-444444444444";
const CHANNEL_STREAM_UUID = "55555555-5555-4555-8555-555555555555";
const READ_STREAM_UUID = "66666666-6666-4666-8666-666666666666";
const DIRECT_TOPIC_UUID = "77777777-7777-4777-8777-777777777777";
const CHANNEL_TOPIC_UUID = "88888888-8888-4888-8888-888888888888";
const READ_TOPIC_UUID = "99999999-9999-4999-8999-999999999999";
const DATE_A = "2026-06-22T10:10:00Z";
const DATE_B = "2026-06-22T11:10:00Z";

function stream(overrides: Partial<MessengerStream> = {}): MessengerStream {
  return {
    uuid: CHANNEL_STREAM_UUID,
    projectId: PROJECT_ID,
    ownerUuid: CURRENT_USER_UUID,
    userUuid: CURRENT_USER_UUID,
    role: "member",
    notificationMode: "all_messages",
    name: "Engineering",
    description: "",
    unreadCount: 3,
    sourceName: "native",
    source: { kind: "native" },
    audience: "channel",
    isPrivate: false,
    inviteOnly: false,
    announce: false,
    isArchived: false,
    directUserUuid: null,
    lastMessageUuid: null,
    createdAt: DATE_A,
    updatedAt: DATE_A,
    ...overrides,
  };
}

function topic(overrides: Partial<MessengerTopic> = {}): MessengerTopic {
  return {
    uuid: CHANNEL_TOPIC_UUID,
    projectId: PROJECT_ID,
    streamUuid: CHANNEL_STREAM_UUID,
    userUuid: CURRENT_USER_UUID,
    name: "Releases",
    unreadCount: 2,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    lastMessageUuid: null,
    createdAt: DATE_A,
    updatedAt: DATE_A,
    ...overrides,
  };
}

function user(overrides: Partial<User> = {}): User {
  return {
    uuid: DIRECT_USER_UUID,
    username: "alice",
    status: "active",
    firstName: "Alice",
    lastName: "Reed",
    displayName: "Alice Reed",
    email: "alice@example.com",
    avatarUrl: null,
    statusEmoji: null,
    statusText: null,
    lastPingAt: DATE_A,
    createdAt: DATE_A,
    updatedAt: DATE_A,
    ...overrides,
  };
}

function renderInbox(): void {
  render(
    <MemoryRouter initialEntries={[workspaceInboxRoute(ORGANIZATION_ID, PROJECT_ID)]}>
      <Routes>
        <Route path="/org/:orgId/project/:projectId/inbox" element={<InboxPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function seedWorkspaceInbox(input?: {
  streams?: MessengerStream[];
  topics?: MessengerTopic[];
  users?: User[];
}): void {
  useWorkspaceAuthStore.getState().setSession({
    accountId: "account",
    instanceId: "instance",
    organizationId: ORGANIZATION_ID,
    organizationOrigin: "https://workspace.example.com",
    projectId: PROJECT_ID,
    userUuid: CURRENT_USER_UUID,
    login: "me@example.com",
    accessToken: "access-token",
    profile: {
      uuid: CURRENT_USER_UUID,
      username: "me",
      firstName: "Me",
      lastName: null,
      email: "me@example.com",
      status: "active",
    },
  });
  useUsersStore.getState().replaceUsers(input?.users ?? [user()]);
  useMessengerStore.setState({
    ownerKey: "account",
    isLoading: false,
    error: null,
    streamsById: Object.fromEntries((input?.streams ?? []).map((item) => [item.uuid, item])),
    streamIds: (input?.streams ?? []).map((item) => item.uuid),
    topicsById: Object.fromEntries((input?.topics ?? []).map((item) => [item.uuid, item])),
    topicIds: (input?.topics ?? []).map((item) => item.uuid),
  });
}

describe("InboxPage workspace data", () => {
  beforeEach(() => {
    navigateSpy.mockReset();
    useWorkspaceAuthStore.getState().clear();
    useMessengerStore.getState().clear();
    useUsersStore.getState().clear();
  });

  afterEach(() => {
    navigateSpy.mockReset();
    useWorkspaceAuthStore.getState().clear();
    useMessengerStore.getState().clear();
    useUsersStore.getState().clear();
  });

  it("renders unread direct private streams in DM and unread channels in Channels", () => {
    seedWorkspaceInbox({
      streams: [
        stream({
          uuid: DIRECT_STREAM_UUID,
          name: "Alice fallback",
          audience: "private",
          isPrivate: true,
          directUserUuid: DIRECT_USER_UUID,
          unreadCount: 4,
          updatedAt: DATE_B,
        }),
        stream({ uuid: CHANNEL_STREAM_UUID, name: "Engineering", unreadCount: 3 }),
      ],
      topics: [
        topic({
          uuid: DIRECT_TOPIC_UUID,
          streamUuid: DIRECT_STREAM_UUID,
          name: "Planning",
          unreadCount: 4,
          updatedAt: DATE_B,
        }),
        topic({ uuid: CHANNEL_TOPIC_UUID, name: "Releases", unreadCount: 2 }),
      ],
    });

    renderInbox();

    expect(screen.getByText("Direct messages")).toBeInTheDocument();
    expect(screen.getByText("Channels")).toBeInTheDocument();
    expect(screen.getByText("Alice Reed")).toBeInTheDocument();
    expect(screen.getByText("Alice Reed · Planning")).toBeInTheDocument();
    expect(screen.getByText("#Engineering")).toBeInTheDocument();
    expect(screen.getByText("#Engineering · Releases")).toBeInTheDocument();
  });

  it("hides streams and topics without unread counters", () => {
    seedWorkspaceInbox({
      streams: [
        stream({
          uuid: READ_STREAM_UUID,
          name: "Read channel",
          unreadCount: 0,
        }),
      ],
      topics: [
        topic({
          uuid: READ_TOPIC_UUID,
          streamUuid: READ_STREAM_UUID,
          name: "Read topic",
          unreadCount: 0,
        }),
      ],
    });

    renderInbox();

    expect(screen.queryByText("#Read channel")).not.toBeInTheDocument();
    expect(screen.queryByText("#Read channel · Read topic")).not.toBeInTheDocument();
    expect(screen.getByText("No unread messages")).toBeInTheDocument();
  });

  it("shows only unread topics inside an unread stream", () => {
    seedWorkspaceInbox({
      streams: [stream({ uuid: CHANNEL_STREAM_UUID, name: "Engineering", unreadCount: 3 })],
      topics: [
        topic({ uuid: CHANNEL_TOPIC_UUID, name: "Releases", unreadCount: 2 }),
        topic({ uuid: READ_TOPIC_UUID, name: "Archive", unreadCount: 0 }),
      ],
    });

    renderInbox();

    expect(screen.getByText("#Engineering · Releases")).toBeInTheDocument();
    expect(screen.queryByText("#Engineering · Archive")).not.toBeInTheDocument();
  });

  it("navigates topic rows to the prepared Workspace topic route", () => {
    seedWorkspaceInbox({
      streams: [stream({ uuid: CHANNEL_STREAM_UUID, name: "Engineering", unreadCount: 2 })],
      topics: [topic({ uuid: CHANNEL_TOPIC_UUID, name: "Releases", unreadCount: 2 })],
    });

    renderInbox();

    const button = screen.getByText("#Engineering · Releases").closest("button");
    expect(button).not.toBeNull();
    fireEvent.click(button!);

    expect(navigateSpy).toHaveBeenCalledWith(
      workspaceMessengerTopicRoute({
        orgId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        streamUuid: CHANNEL_STREAM_UUID,
        topicUuid: CHANNEL_TOPIC_UUID,
      }),
    );
  });

  it("falls back to the prepared stream route when a stream has unread without unread topics", () => {
    seedWorkspaceInbox({
      streams: [stream({ uuid: CHANNEL_STREAM_UUID, name: "Engineering", unreadCount: 2 })],
      topics: [topic({ uuid: READ_TOPIC_UUID, name: "Archive", unreadCount: 0 })],
    });

    renderInbox();

    const button = screen.getByRole("button", { name: /#Engineering/ });
    expect(button).not.toBeNull();
    fireEvent.click(button);

    expect(navigateSpy).toHaveBeenCalledWith(
      workspaceMessengerStreamRoute({
        orgId: ORGANIZATION_ID,
        projectId: PROJECT_ID,
        streamUuid: CHANNEL_STREAM_UUID,
      }),
    );
  });
});
