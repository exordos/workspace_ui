import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { setLocale } from "~/i18n/i18n";
import { WorkspaceMessagePollConnected } from "./workspace-message-poll-connected.ui";

const mocks = vi.hoisted(() => {
  const runtime = {
    accountId: "a",
    instanceId: "i",
    organizationId: "o",
    projectId: "p",
    userUuid: "u",
    runtimeGeneration: 1,
  };
  const auth = {
    currentAccountId: "a",
    runtimeGeneration: 1,
    getCurrentRuntimeContext: () => runtime,
  };
  const messenger = {
    ownerKey: "account:a:instance:i:organization:o:project:p:user:u",
    streamsById: {
      s: { projectId: "p", userUuid: "u", role: "member", sourceName: "native", isArchived: false },
    },
  };
  return { runtime, auth, messenger, mutate: vi.fn(), voters: vi.fn() };
});
vi.mock("~/entities/workspace-auth/workspace-auth.model", () => ({
  selectCurrentWorkspaceRuntimeContext: () => null,
  useWorkspaceAuthStore: Object.assign(
    (selector: (state: typeof mocks.auth) => unknown) => selector(mocks.auth),
    { getState: () => mocks.auth },
  ),
}));
vi.mock("~/entities/messenger/messenger.model", () => ({
  useMessengerStore: (selector: (state: typeof mocks.messenger) => unknown) =>
    selector(mocks.messenger),
}));
vi.mock("~/entities/messenger/messenger-poll-actions.lib", () => ({
  mutateMessengerPoll: mocks.mutate,
  getMessengerPollVoters: mocks.voters,
}));

const message = {
  uuid: "message",
  streamUuid: "s",
  authorUuid: "u",
  projectId: "p",
  payload: {
    kind: "poll",
    questions: [
      {
        uuid: "q",
        text: "Question",
        options: [
          { uuid: "a", text: "Alpha" },
          { uuid: "b", text: "Beta" },
        ],
        correctOptionUuids: [],
      },
    ],
    multipleAnswers: false,
    isAnonymous: false,
    allowRevote: true,
    resultsVisibility: "always",
    allowAddingOptions: false,
    closesAt: null,
    closedAt: null,
  },
  pollState: {
    revision: 1,
    isClosed: false,
    voterCount: 1,
    questions: [{ questionUuid: "q", voterCount: 1, optionCounts: { a: 1 } }],
    myVotes: [],
  },
} as unknown as MessengerMessage;
const props = {
  message,
  readOnly: false,
  usersById: {},
  settingsOpen: false,
  setSettingsOpen: vi.fn(),
  closeOpen: false,
  deadlineReached: false,
  setCloseOpen: vi.fn(),
};
const previewUuids = Array.from(
  { length: 20 },
  (_, index) => `voter-${String(index + 1).padStart(2, "0")}`,
);

function messageWithPreview(count: number, voters = previewUuids, revision = 1): MessengerMessage {
  return {
    ...message,
    pollState: {
      revision,
      isClosed: false,
      voterCount: count,
      questions: [
        {
          questionUuid: "q",
          voterCount: count,
          optionCounts: { a: count, b: 0 },
          optionVoterPreviews: { a: voters },
        },
      ],
      myVotes: [],
    },
  };
}

beforeEach(() => {
  setLocale("en");
  vi.clearAllMocks();
  mocks.voters.mockReset();
  mocks.voters.mockResolvedValue({ items: [], nextPageMarker: null });
});
describe("connected poll", () => {
  it("loads a five-voter preview and refreshes it on revision changes", async () => {
    mocks.voters.mockResolvedValue({ items: [{ uuid: "recent" }], nextPageMarker: null });
    const { rerender } = render(<WorkspaceMessagePollConnected {...props} />);
    expect(await screen.findByTitle("#recent")).toBeInTheDocument();
    expect(mocks.voters).toHaveBeenCalledWith(
      expect.objectContaining({
        pageLimit: 5,
        optionUuid: "a",
        questionUuid: "q",
      }),
    );
    mocks.voters.mockResolvedValue({ items: [{ uuid: "newest" }], nextPageMarker: null });
    rerender(
      <WorkspaceMessagePollConnected
        {...props}
        message={{
          ...message,
          pollState: { ...message.pollState!, revision: 2 },
        }}
      />,
    );
    expect(screen.queryByTitle("#recent")).not.toBeInTheDocument();
    expect(await screen.findByTitle("#newest")).toBeInTheDocument();
  });
  it("caps legacy fallback requests for a 400-option poll while keeping explicit lists available", async () => {
    if (message.payload.kind !== "poll") throw new Error("Expected poll");
    const questions = Array.from({ length: 20 }, (_, q) => ({
      uuid: `q${q}`,
      text: `Question ${q}`,
      options: Array.from({ length: 20 }, (_, o) => ({ uuid: `o${o}`, text: `Answer ${o}` })),
      correctOptionUuids: [],
    }));
    const large: MessengerMessage = {
      ...message,
      payload: { ...message.payload, questions },
      pollState: {
        ...message.pollState!,
        questions: questions.map((q) => ({
          questionUuid: q.uuid,
          voterCount: 20,
          optionCounts: Object.fromEntries(q.options.map((o) => [o.uuid, 1])),
        })),
      },
    };
    render(<WorkspaceMessagePollConnected {...props} message={large} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.voters).toHaveBeenCalledTimes(5);
    fireEvent.click(screen.getAllByRole("button", { name: /Who chose .*Answer 19/ })[0]!);
    await waitFor(() => expect(mocks.voters).toHaveBeenCalledTimes(6));
    expect(mocks.voters.mock.calls[5]?.[0]).toMatchObject({
      questionUuid: "q0",
      optionUuid: "o19",
    });
  });
  it.each([
    { readOnly: true, isAnonymous: false, resultsVisibility: "always" },
    { readOnly: false, isAnonymous: true, resultsVisibility: "always" },
    { readOnly: false, isAnonymous: false, resultsVisibility: "after_vote" },
  ] as const)("hides voter identities and skips fallback for %j", (restriction) => {
    const { readOnly, ...visibility } = restriction;
    if (message.payload.kind !== "poll") throw new Error("Expected poll");
    const payload = { ...message.payload, ...visibility };
    const { rerender } = render(
      <WorkspaceMessagePollConnected
        {...props}
        readOnly={readOnly}
        message={{ ...message, payload }}
      />,
    );
    expect(mocks.voters).not.toHaveBeenCalled();
    rerender(
      <WorkspaceMessagePollConnected
        {...props}
        readOnly={readOnly}
        message={{ ...messageWithPreview(20), payload }}
      />,
    );
    expect(screen.queryByTitle("#voter-01")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Who chose/ })).not.toBeInTheDocument();
  });
  it("shows five inline avatars and opens complete and empty lists without requests", () => {
    render(<WorkspaceMessagePollConnected {...props} message={messageWithPreview(20)} />);
    expect(screen.getByTitle("#voter-05")).toBeVisible();
    expect(screen.queryByTitle("#voter-06")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "20 participants · View votes" }));
    const dialog = within(screen.getByRole("dialog", { name: "Voters" }));
    expect(dialog.getByText("#voter-20")).toBeVisible();
    expect(dialog.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole("combobox", { name: "Answer" }));
    fireEvent.click(screen.getByRole("option", { name: "Beta" }));
    expect(dialog.getByText("No votes yet")).toBeVisible();
    expect(dialog.queryByText("#voter-20")).not.toBeInTheDocument();
    expect(mocks.voters).not.toHaveBeenCalled();
  });
  it("continues a partial inline list from its last UUID and retries the same page", async () => {
    mocks.voters
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ items: [{ uuid: "voter-21" }], nextPageMarker: null });
    render(<WorkspaceMessagePollConnected {...props} message={messageWithPreview(21)} />);
    fireEvent.click(screen.getByRole("button", { name: /Who chose .*Alpha/ }));
    const dialog = within(screen.getByRole("dialog", { name: "Voters" }));
    expect(dialog.getByText("#voter-20")).toBeVisible();
    expect(mocks.voters).not.toHaveBeenCalled();
    fireEvent.click(dialog.getByRole("button", { name: "Load more" }));
    fireEvent.click(await dialog.findByRole("button", { name: "Retry" }));
    expect(await dialog.findByText("#voter-21")).toBeVisible();
    expect(dialog.getByText("#voter-20")).toBeVisible();
    expect(dialog.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(mocks.voters).toHaveBeenCalledTimes(2);
    for (const [request] of mocks.voters.mock.calls) {
      expect(request).toMatchObject({ questionUuid: "q", optionUuid: "a", pageMarker: "voter-20" });
    }
  });
  it("reseeds the open list when the revision changes and discards an old page", async () => {
    let finish!: (value: { items: { uuid: string }[] }) => void;
    mocks.voters.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { rerender } = render(
      <WorkspaceMessagePollConnected {...props} message={messageWithPreview(21)} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Who chose .*Alpha/ }));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    rerender(
      <WorkspaceMessagePollConnected {...props} message={messageWithPreview(1, ["latest"], 2)} />,
    );
    const dialog = within(screen.getByRole("dialog", { name: "Voters" }));
    expect(dialog.getByText("#latest")).toBeVisible();
    expect(dialog.queryByText("#voter-01")).not.toBeInTheDocument();
    expect(mocks.voters.mock.calls[0]?.[0].signal.aborted).toBe(true);
    await act(async () => {
      finish({ items: [{ uuid: "stale" }] });
      await Promise.resolve();
    });
    expect(dialog.queryByText("#stale")).not.toBeInTheDocument();
  });
  it("closes an after-vote list on withdrawal and drops the in-flight page", async () => {
    const withPreview = messageWithPreview(21);
    if (withPreview.payload.kind !== "poll") throw new Error("Expected poll");
    const afterVote: MessengerMessage = {
      ...withPreview,
      payload: { ...withPreview.payload, resultsVisibility: "after_vote" },
      pollState: {
        ...withPreview.pollState!,
        myVotes: [{ questionUuid: "q", optionUuids: ["a"] }],
      },
    };
    let finish!: (value: { items: { uuid: string }[] }) => void;
    mocks.voters.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { rerender } = render(<WorkspaceMessagePollConnected {...props} message={afterVote} />);
    fireEvent.click(screen.getByRole("button", { name: /Who chose .*Alpha/ }));
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    rerender(
      <WorkspaceMessagePollConnected
        {...props}
        message={{ ...afterVote, pollState: { ...afterVote.pollState!, myVotes: [] } }}
      />,
    );
    expect(screen.queryByRole("dialog", { name: "Voters" })).not.toBeInTheDocument();
    expect(screen.queryByTitle("#voter-01")).not.toBeInTheDocument();
    expect(mocks.voters.mock.calls[0]?.[0].signal.aborted).toBe(true);
    await act(async () => {
      finish({ items: [{ uuid: "stale" }] });
      await Promise.resolve();
    });
    expect(screen.queryByText("#stale")).not.toBeInTheDocument();

    rerender(<WorkspaceMessagePollConnected {...props} message={afterVote} />);
    expect(screen.queryByRole("dialog", { name: "Voters" })).not.toBeInTheDocument();
  });
  it("rejects a late preview after a runtime generation switch", async () => {
    let finish!: (value: { items: { uuid: string }[] }) => void;
    mocks.voters.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(<WorkspaceMessagePollConnected {...props} />);
    const generation = mocks.runtime.runtimeGeneration;
    mocks.runtime.runtimeGeneration++;
    await act(async () => {
      finish({ items: [{ uuid: "stale" }] });
      await Promise.resolve();
    });
    expect(screen.queryByTitle("#stale")).not.toBeInTheDocument();
    mocks.runtime.runtimeGeneration = generation;
  });
  it("reuses the option UUID when retrying an addition after a lost response", async () => {
    if (message.payload.kind !== "poll") throw new Error("Expected poll");
    mocks.mutate.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(
      <WorkspaceMessagePollConnected
        {...props}
        message={{ ...message, payload: { ...message.payload, allowAddingOptions: true } }}
      />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "New option" }), {
      target: { value: "Another answer" },
    });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "New option" }), { key: "Enter" });
    expect(await screen.findByText("Could not add the option. Try again.")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "New option" })).toHaveValue("Another answer");
    fireEvent.keyDown(screen.getByRole("textbox", { name: "New option" }), { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "New option" })).toHaveValue(""),
    );
    const firstAttempt = mocks.mutate.mock.calls[0]?.[0];
    expect(firstAttempt).toMatchObject({
      messageUuid: "message",
      action: { kind: "addOption", questionUuid: "q", option: { text: "Another answer" } },
    });
    expect(mocks.mutate.mock.calls[1]?.[0]).toEqual(firstAttempt);
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });
  it("sends a vote immediately and waits for the server snapshot", async () => {
    let finish!: () => void;
    mocks.mutate.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    render(<WorkspaceMessagePollConnected {...props} />);
    const option = screen.getByRole("button", { name: "Alpha" });
    fireEvent.click(option);
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        messageUuid: "message",
        action: { kind: "vote", questionUuid: "q", optionUuid: "a", selected: true },
      }),
    );
    expect(option).toHaveAttribute("aria-pressed", "false");
    expect(option).toBeDisabled();
    finish();
    await waitFor(() => expect(option).toBeEnabled());
  });
  it("loads and appends voter pages using the server marker", async () => {
    mocks.voters.mockImplementation((options: { pageLimit?: number; pageMarker?: string }) => {
      if (options.pageLimit === 5) return Promise.resolve({ items: [], nextPageMarker: null });
      return Promise.resolve(
        options.pageMarker
          ? { items: [{ uuid: "two" }], nextPageMarker: null }
          : { items: [{ uuid: "one" }], nextPageMarker: "next" },
      );
    });
    render(<WorkspaceMessagePollConnected {...props} />);
    fireEvent.click(screen.getByRole("button", { name: /Who chose .*Alpha/ }));
    expect(await screen.findByText("#one")).toBeInTheDocument();
    expect(mocks.voters).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageMarker: undefined }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("#two")).toBeInTheDocument();
    expect(screen.getByText("#one")).toBeInTheDocument();
    expect(mocks.voters).toHaveBeenLastCalledWith(expect.objectContaining({ pageMarker: "next" }));
  });
});
