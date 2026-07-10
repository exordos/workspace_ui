import { describe, expect, it, vi } from "vitest";

interface ForwardMessage {
  uuid: string;
  streamUuid: string;
  topicUuid: string;
  authorUuid: string;
  payload: { kind: "markdown"; content: string };
  createdAt: string;
}

const LIB_MODULE = "./workspace-forward-message.lib";

function createForwardMessage(overrides: Partial<ForwardMessage> = {}): ForwardMessage {
  return {
    uuid: "message-a",
    streamUuid: "stream-a",
    topicUuid: "topic-a",
    authorUuid: "user-a",
    payload: { kind: "markdown", content: "full message text" },
    createdAt: "2026-07-06T09:00:00.000Z",
    ...overrides,
  };
}

describe("workspace forward message lib contract", () => {
  it("exports pure helpers expected by later phases", async () => {
    const mod = await import(LIB_MODULE);

    expect(mod.normalizeSelectedForwardText).toEqual(expect.any(Function));
    expect(mod.uniqueForwardMessageUuids).toEqual(expect.any(Function));
    expect(mod.resolveWorkspaceForwardMessages).toEqual(expect.any(Function));
    expect(mod.buildWorkspaceForwardMarkdown).toEqual(expect.any(Function));
    expect(mod.buildWorkspaceForwardStreamOptions).toEqual(expect.any(Function));
    expect(mod.buildWorkspaceForwardTopicOptions).toEqual(expect.any(Function));
    expect(mod.findWorkspaceDirectForwardTarget).toEqual(expect.any(Function));
    expect(mod.resolveWorkspaceForwardTarget).toEqual(expect.any(Function));
  });

  it("normalizes selected text to a meaningful optional value", async () => {
    const { normalizeSelectedForwardText } = await import(LIB_MODULE);

    expect(normalizeSelectedForwardText(" \n selected fragment \t ")).toBe("selected fragment");
    expect(normalizeSelectedForwardText("\n\t ")).toBeUndefined();
    expect(normalizeSelectedForwardText(undefined)).toBeUndefined();
  });

  it("keeps unique non-empty message uuids in user order", async () => {
    const { uniqueForwardMessageUuids } = await import(LIB_MODULE);

    expect(uniqueForwardMessageUuids(["", "message-a", " ", "message-b", "message-a"])).toEqual([
      "message-a",
      "message-b",
    ]);
  });

  it("uses selected text only when forwarding one message", async () => {
    const { buildWorkspaceForwardMarkdown } = await import(LIB_MODULE);

    const markdown = buildWorkspaceForwardMarkdown({
      messages: [createForwardMessage()],
      selectedText: "selected fragment",
      resolveAuthorLabel: vi.fn(() => "Alice"),
    });

    expect(markdown).toContain("selected fragment");
    expect(markdown).not.toContain("full message text");
  });

  it("does not replace several messages with one selected text", async () => {
    const { buildWorkspaceForwardMarkdown } = await import(LIB_MODULE);

    const markdown = buildWorkspaceForwardMarkdown({
      messages: [
        createForwardMessage({
          uuid: "message-a",
          payload: { kind: "markdown", content: "first full text" },
        }),
        createForwardMessage({
          uuid: "message-b",
          payload: { kind: "markdown", content: "second full text" },
        }),
      ],
      selectedText: "selected fragment",
      resolveAuthorLabel: vi.fn(() => "Alice"),
    });

    expect(markdown).toContain("first full text");
    expect(markdown).toContain("second full text");
    expect(markdown).not.toContain("selected fragment");
  });

  it("uses canonical Workspace user and message links in the forwarded quote", async () => {
    const { buildWorkspaceForwardMarkdown } = await import(LIB_MODULE);

    const markdown = buildWorkspaceForwardMarkdown({
      messages: [createForwardMessage()],
      resolveAuthorLabel: vi.fn(() => "Alice [Admin]"),
      wroteLabel: "said",
    });

    expect(markdown).toContain(
      "> [Alice \\[Admin\\]](urn:user:user-a) [said](urn:message:message-a):",
    );
  });

  it("reuses an existing private stream with default topic for a direct target", async () => {
    const { resolveWorkspaceForwardTarget } = await import(LIB_MODULE);
    const createWorkspaceDirectStream = vi.fn();

    await expect(
      resolveWorkspaceForwardTarget({
        target: { kind: "direct", userUuid: "user-b" },
        runtimeContext: { accessToken: "token", projectId: "project-a" },
        streams: [
          {
            uuid: "direct-stream",
            audience: "private",
            isPrivate: true,
            directUserUuid: "user-b",
          },
        ],
        topics: [{ uuid: "direct-topic", streamUuid: "direct-stream", isDefault: true }],
        createWorkspaceDirectStream,
      }),
    ).resolves.toMatchObject({
      kind: "topic",
      streamUuid: "direct-stream",
      topicUuid: "direct-topic",
    });
    expect(createWorkspaceDirectStream).not.toHaveBeenCalled();
  });

  it("creates a private stream when direct target has no existing stream", async () => {
    const { resolveWorkspaceForwardTarget } = await import(LIB_MODULE);
    const createWorkspaceDirectStream = vi.fn().mockResolvedValue({
      stream: { uuid: "created-stream", directUserUuid: "user-b" },
      defaultTopic: { uuid: "created-topic", streamUuid: "created-stream", isDefault: true },
    });

    await expect(
      resolveWorkspaceForwardTarget({
        target: { kind: "direct", userUuid: "user-b" },
        runtimeContext: { accessToken: "token", projectId: "project-a" },
        streams: [],
        topics: [],
        createWorkspaceDirectStream,
      }),
    ).resolves.toMatchObject({
      kind: "topic",
      streamUuid: "created-stream",
      topicUuid: "created-topic",
    });
    expect(createWorkspaceDirectStream).toHaveBeenCalledWith(
      expect.objectContaining({
        directUserUuid: "user-b",
        runtimeContext: expect.objectContaining({ projectId: "project-a" }),
      }),
    );
  });
});
