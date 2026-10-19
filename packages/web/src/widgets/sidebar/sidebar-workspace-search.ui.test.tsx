import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { adaptMessengerFolder } from "~/entities/messenger/messenger-adapters.lib";
import {
  MESSENGER_ALL_CHATS_FOLDER_UUID,
  MESSENGER_CHANNELS_FOLDER_UUID,
  MESSENGER_PERSONAL_FOLDER_UUID,
} from "~/entities/messenger/messenger-folder-system-type.lib";
import type {
  MessengerFolder,
  MessengerSidebarStreamItem,
  MessengerSidebarTopicItem,
} from "~/entities/messenger/messenger.types";
import { getLocale, setLocale, t } from "~/i18n/i18n";
import * as datetime from "~/shared/lib/datetime.lib";
import { renderWithProviders } from "~/test/render";
import { useSidebarConfigStore } from "./sidebar-config.model";
import { WorkspaceSidebar } from "./sidebar-workspace.ui";

const DATE = "2026-08-26T10:00:00Z";

function backendSystemFolderType(uuid: string, title: string): MessengerFolder["systemType"] {
  return adaptMessengerFolder({
    uuid,
    title,
    unread_count: 0,
    system_type: "all",
    folder_items: [],
    created_at: DATE,
    updated_at: DATE,
  }).systemType;
}

function topic(streamUuid: string, topicUuid: string, title: string): MessengerSidebarTopicItem {
  return {
    id: `topic:${streamUuid}:${topicUuid}`,
    streamUuid,
    topicUuid,
    title,
    unreadCount: 0,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    color: null,
    route: `/org/acme/project/project-a/messenger/stream/${streamUuid}/topic/${topicUuid}`,
    preview: null,
    lastMessageCreatedAt: null,
    updatedAt: DATE,
  };
}

function stream(
  streamUuid: string,
  title: string,
  topics: MessengerSidebarTopicItem[] = [],
): MessengerSidebarStreamItem {
  return {
    id: `stream:${streamUuid}`,
    streamUuid,
    directUserUuid: null,
    title,
    audience: "channel",
    isPrivate: false,
    isArchived: false,
    uiKind: "channel",
    notificationMode: "mentions_only",
    unreadCount: 0,
    pinnedAt: null,
    orderIndex: null,
    route: `/org/acme/project/project-a/messenger/stream/${streamUuid}`,
    topics,
    preview: null,
    updatedAt: DATE,
    lastMessageCreatedAt: null,
  };
}

const LOCAL_SEARCH_FOLDER_CASES: readonly [string, MessengerFolder["systemType"]][] = [
  ["Personal", backendSystemFolderType(MESSENGER_PERSONAL_FOLDER_UUID, "Personal")],
  ["Channels", backendSystemFolderType(MESSENGER_CHANNELS_FOLDER_UUID, "Channels")],
  ["custom", null],
];
const BACKEND_ALL_FOLDER_SYSTEM_TYPE = backendSystemFolderType(
  MESSENGER_ALL_CHATS_FOLDER_UUID,
  "All chats",
);

function renderSidebar(input: {
  streams: MessengerSidebarStreamItem[];
  allStreams?: MessengerSidebarStreamItem[];
  selectedFolderSystemType?: MessengerFolder["systemType"];
  folderRail?: boolean;
}): void {
  renderWithProviders(
    <WorkspaceSidebar
      streams={input.streams}
      allStreams={input.allStreams}
      loading={false}
      error={null}
      activityCounts={{ inboxCount: null, mentionsCount: null }}
      workspaceStreamCount={input.allStreams?.length ?? input.streams.length}
      selectedFolderSystemType={input.selectedFolderSystemType ?? "created"}
      activityPanelBottomSlot={
        input.folderRail === true ? <div data-testid="folder-rail-slot" /> : undefined
      }
    />,
    { route: "/org/acme/project/project-a/stream/stream-a" },
  );
}

describe("WorkspaceSidebar search mode", () => {
  afterEach(() => {
    useSidebarConfigStore.getState().setSearchQuery("");
    useSidebarConfigStore.getState().setConfig({
      activityOpen: false,
      expandedStreamUuids: [],
    });
  });

  it("derives search mode from content and restores Activity and collapse state after clearing", () => {
    const engineering = stream("stream-a", "Engineering", [
      topic("stream-a", "topic-release", "Release plan"),
    ]);
    useSidebarConfigStore.getState().setConfig({ activityOpen: true, expandedStreamUuids: [] });
    useSidebarConfigStore.getState().setSearchQuery("   ");

    renderSidebar({ streams: [engineering], allStreams: [engineering], folderRail: true });

    expect(screen.getByRole("button", { name: t("nav.activity") })).toBeInTheDocument();
    expect(screen.queryByText("#Release plan")).not.toBeInTheDocument();
    expect(screen.getByTestId("folder-rail-slot")).toBeInTheDocument();

    act(() => useSidebarConfigStore.getState().setSearchQuery("release"));

    expect(screen.queryByRole("button", { name: t("nav.activity") })).not.toBeInTheDocument();
    expect(screen.getByText("#Release plan")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: t("a11y.collapseTopics") }),
    ).not.toBeInTheDocument();
    expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual([]);
    expect(screen.getByTestId("folder-rail-slot")).toBeInTheDocument();

    act(() => useSidebarConfigStore.getState().setSearchQuery(""));

    expect(screen.getByRole("button", { name: t("nav.activity") })).toBeInTheDocument();
    expect(screen.queryByText("#Release plan")).not.toBeInTheDocument();
    expect(useSidebarConfigStore.getState().expandedStreamUuids).toEqual([]);
  });

  it("renders deduplicated local results before labeled global results", () => {
    const engineering = stream("stream-a", "Engineering", [
      topic("stream-a", "topic-release", "Release plan"),
      topic("stream-a", "topic-unrelated", "Unrelated"),
    ]);
    const product = stream("stream-b", "Product", [
      topic("stream-b", "topic-release-ops", "Release operations"),
    ]);
    useSidebarConfigStore.getState().setSearchQuery("release");

    renderSidebar({ streams: [engineering], allStreams: [engineering, product] });

    expect(screen.getAllByText("#Engineering")).toHaveLength(1);
    expect(screen.getByText("#Release plan")).toBeInTheDocument();
    expect(screen.queryByText("#Unrelated")).not.toBeInTheDocument();
    const showMoreTopics = screen.getByRole("button", {
      name: t("channel.showMoreTopicsWithCount", { count: 1 }),
    });
    fireEvent.click(showMoreTopics);
    expect(screen.getByText("#Unrelated")).toBeInTheDocument();
    const hideExtraTopics = screen.getByRole("button", {
      name: t("channel.hideExtraTopics"),
    });
    fireEvent.click(hideExtraTopics);
    expect(screen.queryByText("#Unrelated")).not.toBeInTheDocument();
    expect(
      screen.getByRole("separator", { name: t("sidebar.allFoldersResults") }),
    ).toBeInTheDocument();
    expect(screen.getByText("#Product")).toBeInTheDocument();
    expect(screen.getByText("#Release operations")).toBeInTheDocument();
  });

  it("reveals all topics when only the stream title matches", () => {
    const engineering = stream("stream-a", "Engineering", [
      topic("stream-a", "topic-general", "General"),
      topic("stream-a", "topic-support", "Support"),
    ]);
    useSidebarConfigStore.getState().setSearchQuery("engineering");

    renderSidebar({ streams: [engineering], allStreams: [engineering] });

    expect(screen.queryByText("#General")).not.toBeInTheDocument();
    expect(screen.queryByText("#Support")).not.toBeInTheDocument();
    const showMoreTopics = screen.getByRole("button", {
      name: t("channel.showMoreTopicsWithCount", { count: 2 }),
    });

    fireEvent.click(showMoreTopics);

    expect(screen.getByText("#General")).toBeInTheDocument();
    expect(screen.getByText("#Support")).toBeInTheDocument();
  });

  it.each(LOCAL_SEARCH_FOLDER_CASES)(
    "renders local and global results for the %s folder",
    (_label, selectedFolderSystemType) => {
      const local = stream("stream-a", "Release planning");
      const global = stream("stream-b", "Release operations");
      useSidebarConfigStore.getState().setSearchQuery("release");

      renderSidebar({
        streams: [local],
        allStreams: [local, global],
        selectedFolderSystemType,
      });

      expect(screen.getByText("#Release planning")).toBeInTheDocument();
      expect(
        screen.getByRole("separator", { name: t("sidebar.allFoldersResults") }),
      ).toBeInTheDocument();
      expect(screen.getByText("#Release operations")).toBeInTheDocument();
    },
  );

  it("announces a local miss before global matches", () => {
    const engineering = stream("stream-a", "Engineering");
    const product = stream("stream-b", "Product", [
      topic("stream-b", "topic-launch", "Launch plan"),
    ]);
    useSidebarConfigStore.getState().setSearchQuery("launch");

    renderSidebar({ streams: [engineering], allStreams: [engineering, product] });

    expect(screen.getByRole("status")).toHaveTextContent(t("sidebar.noMatchesInFolder"));
    expect(
      screen.queryByRole("separator", { name: t("sidebar.allFoldersResults") }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("#Product")).toBeInTheDocument();
    expect(screen.getByText("#Launch plan")).toBeInTheDocument();
  });

  it("does not announce a local miss before search data is available", () => {
    useSidebarConfigStore.getState().setSearchQuery("launch");

    renderWithProviders(
      <WorkspaceSidebar
        streams={[]}
        allStreams={[]}
        loading
        error={null}
        activityCounts={{ inboxCount: null, mentionsCount: null }}
        workspaceStreamCount={0}
        selectedFolderSystemType="created"
      />,
      { route: "/org/acme/project/project-a" },
    );

    expect(screen.getByRole("status")).toHaveTextContent(t("app.loading"));
    expect(screen.queryByText(t("sidebar.noMatchesInFolder"))).not.toBeInTheDocument();
  });

  it("renders cached global matches without a premature local miss while refreshing", () => {
    const product = stream("stream-b", "Product", [
      topic("stream-b", "topic-launch", "Launch plan"),
    ]);
    useSidebarConfigStore.getState().setSearchQuery("launch");

    renderWithProviders(
      <WorkspaceSidebar
        streams={[]}
        allStreams={[product]}
        loading
        error={null}
        activityCounts={{ inboxCount: null, mentionsCount: null }}
        workspaceStreamCount={1}
        selectedFolderSystemType="created"
      />,
      { route: "/org/acme/project/project-a" },
    );

    expect(screen.getByText("#Product")).toBeInTheDocument();
    expect(screen.getByText("#Launch plan")).toBeInTheDocument();
    expect(screen.queryByText(t("sidebar.noMatchesInFolder"))).not.toBeInTheDocument();
    expect(
      screen.queryByRole("separator", { name: t("sidebar.allFoldersResults") }),
    ).not.toBeInTheDocument();
  });

  it("shows only the global list in All and one empty state when nothing matches", () => {
    const engineering = stream("stream-a", "Engineering");
    useSidebarConfigStore.getState().setSearchQuery("engineering");

    const { unmount } = renderWithProviders(
      <WorkspaceSidebar
        streams={[engineering]}
        allStreams={[engineering]}
        loading={false}
        error={null}
        activityCounts={{ inboxCount: null, mentionsCount: null }}
        workspaceStreamCount={1}
        selectedFolderSystemType={BACKEND_ALL_FOLDER_SYSTEM_TYPE}
      />,
      { route: "/org/acme/project/project-a/stream/stream-a" },
    );

    expect(screen.getByText("#Engineering")).toBeInTheDocument();
    expect(screen.queryByText(t("sidebar.noMatchesInFolder"))).not.toBeInTheDocument();
    expect(
      screen.queryByRole("separator", { name: t("sidebar.allFoldersResults") }),
    ).not.toBeInTheDocument();

    unmount();
    useSidebarConfigStore.getState().setSearchQuery("missing");
    renderSidebar({
      streams: [engineering],
      allStreams: [engineering],
      selectedFolderSystemType: BACKEND_ALL_FOLDER_SYSTEM_TYPE,
    });

    expect(screen.getAllByText(t("sidebar.emptySearch"))).toHaveLength(1);
    expect(screen.queryByText(t("sidebar.noMatchesInFolder"))).not.toBeInTheDocument();
  });
});

describe("sidebar row memoization", () => {
  afterEach(() => vi.restoreAllMocks());
  it("formats only changed rows and refreshes memoized labels on locale changes", () => {
    const format = vi.spyOn(datetime, "formatMessageTimeRelative");
    const first = { ...stream("stream-a", "Alpha"), lastMessageCreatedAt: DATE };
    const second = { ...stream("stream-b", "Beta"), lastMessageCreatedAt: DATE };
    const props = {
      loading: false,
      error: null,
      activityCounts: { inboxCount: null, mentionsCount: null },
      workspaceStreamCount: 2,
    };
    const view = renderWithProviders(<WorkspaceSidebar {...props} streams={[first, second]} />);
    expect(format).toHaveBeenCalledTimes(2);
    view.rerender(<WorkspaceSidebar {...props} streams={[first, { ...second, unreadCount: 1 }]} />);
    expect(format).toHaveBeenCalledTimes(3);
    const locale = getLocale();
    act(() => setLocale(locale === "en" ? "ru" : "en"));
    expect(format).toHaveBeenCalledTimes(5);
    act(() => setLocale(locale));
  });
});

describe("sidebar calendar refresh", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
    useSidebarConfigStore.getState().setConfig({ expandedStreamUuids: [] });
  });

  it("refreshes memoized chat and topic labels at midnight with one shared timer", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 23, 59, 59));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const createdAt = new Date(2026, 9, 20, 12).toISOString();
    const release = { ...topic("stream-a", "topic-a", "Release"), lastMessageCreatedAt: createdAt };
    const engineering = {
      ...stream("stream-a", "Engineering", [release]),
      lastMessageCreatedAt: createdAt,
    };
    useSidebarConfigStore.getState().setConfig({ expandedStreamUuids: ["stream-a"] });
    renderSidebar({ streams: [engineering] });
    expect(screen.getAllByText("12:00")).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.getAllByText(t("chat.yesterday"))).toHaveLength(2);
    expect(screen.queryByText("12:00")).not.toBeInTheDocument();
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("defers the calendar while hidden and refreshes labels on return", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 12));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const engineering = {
      ...stream("stream-a", "Engineering"),
      lastMessageCreatedAt: new Date(2026, 9, 20, 9).toISOString(),
    };
    renderSidebar({ streams: [engineering] });
    expect(screen.getByText("09:00")).toBeInTheDocument();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      fireEvent(document, new Event("visibilitychange"));
    });
    expect(vi.getTimerCount()).toBe(0);
    vi.setSystemTime(new Date(2026, 9, 21, 12));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    act(() => {
      fireEvent(document, new Event("visibilitychange"));
    });
    expect(screen.getByText(t("chat.yesterday"))).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
  });

  it("refreshes formatting on visibility return even within the same day and offset", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 20, 12));
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const format = vi.spyOn(datetime, "formatMessageTimeRelative");
    const engineering = { ...stream("stream-a", "Engineering"), lastMessageCreatedAt: DATE };
    renderSidebar({ streams: [engineering] });
    expect(format).toHaveBeenCalledTimes(1);
    act(() => {
      fireEvent(document, new Event("visibilitychange"));
    });
    expect(format).toHaveBeenCalledTimes(2);
  });
});
