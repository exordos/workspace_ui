import { randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import type { Page } from "@playwright/test";
import { test, expect } from "../fixtures";
import {
  closeLiveMessengerSessions,
  liveMessengerApi,
  loadLiveMessengerEnvironment,
  missingLiveMessengerEnvironmentVariables,
  openLiveMessengerSessions,
  openLiveStream,
  sendLiveMessageThroughComposer,
  uploadLiveMessengerFile,
  type LiveApiResponse,
  type LiveMessengerRole,
  type LiveMessengerSession,
} from "../helpers/live-messenger";

interface UserRow {
  email?: string;
  uuid?: string;
}

interface StreamRow {
  default_topic_uuid?: string | null;
  delivery?: Record<string, unknown> | null;
  direct_user_uuid?: string | null;
  name?: string;
  private?: boolean;
  provider?: Record<string, unknown> | null;
  role?: string;
  source?: Record<string, unknown>;
  source_name?: string;
  stream_uuid?: string;
  uuid?: string;
}

interface TopicRow {
  delivery?: Record<string, unknown> | null;
  name?: string;
  provider?: Record<string, unknown> | null;
  source?: Record<string, unknown>;
  source_name?: string;
  stream_uuid?: string;
  uuid?: string;
}

interface MessageRow {
  author_uuid?: string;
  delivery?: Record<string, unknown> | null;
  is_own?: boolean;
  payload?: { content?: string; kind?: string };
  pinned?: boolean;
  provider?: Record<string, unknown> | null;
  reactions?: Record<string, number>;
  read?: boolean;
  source?: Record<string, unknown>;
  source_name?: string;
  starred?: boolean;
  stream_uuid?: string;
  topic_uuid?: string;
  uuid?: string;
}

interface ReactionRow {
  delivery?: Record<string, unknown> | null;
  emoji_name?: string;
  message_uuid?: string;
  provider?: Record<string, unknown> | null;
  uuid?: string;
}

interface MessageEventPayload extends MessageRow {
  kind?: string;
}

interface WorkspaceEventRow {
  action?: string;
  epoch_version?: number;
  object_type?: string;
  payload?: MessageEventPayload;
  schema_version?: number;
}

interface FolderRow {
  folder_items?: FolderItemRow[];
  title?: string;
  uuid?: string;
}

interface FolderItemRow {
  folder_uuid?: string;
  pinned_at?: string | null;
  stream_uuid?: string;
  uuid?: string;
}

const environment = loadLiveMessengerEnvironment();
const missingEnvironment = missingLiveMessengerEnvironmentVariables();
const RUN_PREFIX = "cassi-e2e";

function expectOk<T>(response: LiveApiResponse<T>, operation: string): T {
  expect(response.ok, `${operation} failed with HTTP ${response.status}`).toBe(true);
  return response.data;
}

function expectRows<T>(data: unknown, operation: string): T[] {
  expect(Array.isArray(data), `${operation} did not return the contract array`).toBe(true);
  return data as T[];
}

function expectRow<T>(data: unknown, operation: string): T {
  expect(
    data != null && typeof data === "object" && !Array.isArray(data),
    `${operation} did not return the contract object`,
  ).toBe(true);
  return data as T;
}

function requireUuid(value: unknown, operation: string): string {
  expect(typeof value, `${operation} did not return a UUID`).toBe("string");
  const uuid = String(value).trim().toLowerCase();
  expect(uuid, `${operation} returned an invalid UUID`).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  );
  return uuid;
}

function expectNativeProjection(
  row: {
    delivery?: Record<string, unknown> | null;
    provider?: Record<string, unknown> | null;
    source?: Record<string, unknown>;
    source_name?: string;
  },
  operation: string,
): void {
  expect(row.source_name, `${operation} source_name mismatch`).toBe("native");
  expect(row.source, `${operation} source mismatch`).toEqual({ kind: "native" });
  expect(row.provider, `${operation} provider must be null for a native row`).toBeNull();
  expect(row.delivery, `${operation} delivery must be null for a native row`).toBeNull();
}

function expectNativeProviderProjection(
  row: {
    delivery?: Record<string, unknown> | null;
    provider?: Record<string, unknown> | null;
  },
  operation: string,
): void {
  expect(row.provider, `${operation} provider must be null for a native row`).toBeNull();
  expect(row.delivery, `${operation} delivery must be null for a native row`).toBeNull();
}

async function waitForShell(page: Page): Promise<void> {
  await page.locator("[data-focus-zone='topbar']").waitFor({ state: "visible", timeout: 45_000 });
}

async function fetchMessages(
  page: Page,
  streamUuid: string,
  topicUuid?: string,
): Promise<MessageRow[]> {
  const response = await liveMessengerApi(page, "/messages/", {
    query: {
      page_limit: "200",
      sort_key: "created_at",
      sort_dir: "asc",
      stream_uuid: streamUuid,
      ...(topicUuid != null ? { topic_uuid: topicUuid } : {}),
    },
  });
  expectOk(response, "list messages");
  return expectRows<MessageRow>(response.data, "list messages");
}

async function waitForMessageByContent(
  page: Page,
  streamUuid: string,
  content: string,
  topicUuid?: string,
): Promise<MessageRow> {
  let result: MessageRow | undefined;
  await expect
    .poll(
      async () => {
        const messages = await fetchMessages(page, streamUuid, topicUuid);
        result = messages.find((message) => message.payload?.content === content);
        return result?.uuid ?? null;
      },
      { timeout: 30_000 },
    )
    .not.toBeNull();
  return result!;
}

async function bestEffort(page: Page, method: "DELETE", path: string): Promise<void> {
  try {
    await liveMessengerApi(page, path, { method });
  } catch {
    // Cleanup is best-effort; the first failed product assertion remains authoritative.
  }
}

test.describe("Workspace Messenger preserved contract @live @messenger-contract", () => {
  test.skip(
    environment == null,
    `Requires isolated live accounts: ${missingEnvironment.join(", ")}`,
  );

  test("covers roles, channel/topic, DM, mutations, folders, S3 URNs, realtime and catch-up", async ({
    browser,
  }) => {
    test.setTimeout(8 * 60_000);
    if (environment == null) return;

    let sessions: Partial<Record<LiveMessengerRole, LiveMessengerSession>> = {};
    const createdMessageUuids: string[] = [];
    let groupStreamUuid: string | null = null;
    let groupTopicUuid: string | null = null;
    let directStreamUuid: string | null = null;
    let folderUuid: string | null = null;
    let folderItemUuid: string | null = null;
    let reactionUuid: string | null = null;

    try {
      sessions = await openLiveMessengerSessions(browser, environment);
      const owner = sessions.owner!;
      const moderator = sessions.moderator!;
      const member = sessions.member!;
      const outsider = sessions.outsider!;
      const runId = `${RUN_PREFIX}-${Date.now()}-${randomUUID().slice(0, 8)}`;
      const streamName = `${runId}-group`;
      const topicName = `${runId}-topic`;

      await test.step("resolve the six IAM accounts without exposing credentials", async () => {
        const usersResponse = await liveMessengerApi(owner.page, "/users/", {
          scope: "workspace",
        });
        expectOk(usersResponse, "list users");
        const users = expectRows<UserRow>(usersResponse.data, "list users");
        const userUuidByRole = Object.fromEntries(
          Object.entries(environment.accounts).map(([role, account]) => {
            const user = users.find(
              (candidate) => candidate.email?.trim().toLowerCase() === account.email.toLowerCase(),
            );
            return [role, requireUuid(user?.uuid, `resolve ${role} account`)];
          }),
        ) as Record<LiveMessengerRole, string>;

        await test.step("create a native group stream and role bindings", async () => {
          const streamResponse = await liveMessengerApi(owner.page, "/streams/", {
            method: "POST",
            body: {
              name: streamName,
              description: "Isolated Messenger contract E2E stream",
              source_name: "native",
              source: { kind: "native" },
              invite_only: true,
              announce: false,
            },
          });
          const stream = expectRow<StreamRow>(
            expectOk(streamResponse, "create group stream"),
            "create group stream",
          );
          groupStreamUuid = requireUuid(stream.uuid ?? stream.stream_uuid, "create group stream");
          expect(stream.private).toBe(false);
          expect(stream.role).toBe("owner");
          expect(stream).not.toHaveProperty("private_index");
          expectNativeProjection(stream, "create group stream");

          const bindingsResponse = await liveMessengerApi(
            owner.page,
            `/streams/${groupStreamUuid}/actions/add_users/invoke`,
            {
              method: "POST",
              body: {
                administrator: [userUuidByRole.administrator],
                moderator: [userUuidByRole.moderator],
                member: [userUuidByRole.member],
                guest: [userUuidByRole.guest],
              },
            },
          );
          expectOk(bindingsResponse, "add stream role bindings");

          const topicsResponse = await liveMessengerApi(owner.page, "/stream_topics/", {
            method: "POST",
            body: { stream_uuid: groupStreamUuid, name: topicName },
          });
          const topic = expectRow<TopicRow>(
            expectOk(topicsResponse, "create stream topic"),
            "create stream topic",
          );
          groupTopicUuid = requireUuid(topic.uuid, "create stream topic");
          expect(topic.stream_uuid).toBe(groupStreamUuid);
          expect(topic.name).toBe(topicName);
          expectNativeProjection(topic, "create stream topic");
        });

        await test.step("enforce role visibility and outsider isolation", async () => {
          const expectedRoles: Partial<Record<LiveMessengerRole, string>> = {
            owner: "owner",
            administrator: "administrator",
            moderator: "moderator",
            member: "member",
            guest: "guest",
          };
          for (const [role, expectedRole] of Object.entries(expectedRoles) as [
            LiveMessengerRole,
            string,
          ][]) {
            const response = await liveMessengerApi(sessions[role]!.page, "/streams/");
            expectOk(response, `list streams as ${role}`);
            const streams = expectRows<StreamRow>(response.data, `list streams as ${role}`);
            const visible = streams.find(
              (stream) => (stream.uuid ?? stream.stream_uuid) === groupStreamUuid,
            );
            expect(visible, `${role} cannot see the bound stream`).toBeDefined();
            expect(visible?.role, `${role} binding role mismatch`).toBe(expectedRole);
            expectNativeProjection(visible!, `list stream as ${role}`);
          }

          const outsiderResponse = await liveMessengerApi(outsider.page, "/streams/");
          expectOk(outsiderResponse, "list streams as outsider");
          const outsiderStreams = expectRows<StreamRow>(
            outsiderResponse.data,
            "list streams as outsider",
          );
          expect(
            outsiderStreams.some(
              (stream) => (stream.uuid ?? stream.stream_uuid) === groupStreamUuid,
            ),
          ).toBe(false);
        });

        await test.step("send in the group UI and receive it over realtime", async () => {
          const websocketPromise = member.page.waitForEvent("websocket", {
            predicate: (socket) => {
              const url = new URL(socket.url());
              return url.pathname === "/api/workspace/v1/events/ws";
            },
            timeout: 30_000,
          });
          await member.page.reload();
          await waitForShell(member.page);
          const websocket = await websocketPromise;
          const websocketUrl = new URL(websocket.url());
          expect(websocketUrl.pathname).toBe("/api/workspace/v1/events/ws");
          expect(websocketUrl.searchParams.get("last_epoch_version")).toMatch(/^\d+$/);
          await openLiveStream(owner.page, groupStreamUuid!, topicName);
          const content = `${runId} group message`;
          await sendLiveMessageThroughComposer(owner.page, content);
          await expect(owner.page.getByText(content, { exact: true })).toBeVisible({
            timeout: 20_000,
          });

          const sidebar = member.page.locator("[data-focus-zone='sidebar']");
          await expect
            .poll(async () => (await sidebar.innerText()).includes(content), { timeout: 30_000 })
            .toBe(true);
          await openLiveStream(member.page, groupStreamUuid!, topicName);
          await expect(member.page.getByText(content, { exact: true })).toBeVisible({
            timeout: 30_000,
          });

          const message = await waitForMessageByContent(
            owner.page,
            groupStreamUuid!,
            content,
            groupTopicUuid!,
          );
          const messageUuid = requireUuid(message.uuid, "locate group message");
          createdMessageUuids.push(messageUuid);
          expect(message.author_uuid).toBe(userUuidByRole.owner);
          expect(message.is_own).toBe(true);
          expect(message.read).toBe(true);
          expect(message.pinned).toBe(false);
          expect(message.starred).toBe(false);
          expectNativeProjection(message, "locate owner group message");

          const memberMessage = await waitForMessageByContent(
            member.page,
            groupStreamUuid!,
            content,
            groupTopicUuid!,
          );
          expect(memberMessage.is_own).toBe(false);
          expectNativeProjection(memberMessage, "locate member group message");
        });

        await test.step("edit, react, read and delete with realtime projection", async () => {
          const original = `${runId} mutable`;
          const createdResponse = await liveMessengerApi<MessageRow>(owner.page, "/messages/", {
            method: "POST",
            body: {
              stream_uuid: groupStreamUuid,
              topic_uuid: groupTopicUuid,
              payload: { kind: "markdown", content: original },
            },
          });
          const created = expectRow<MessageRow>(
            expectOk(createdResponse, "create mutable message"),
            "create mutable message",
          );
          const messageUuid = requireUuid(created.uuid, "create mutable message");
          expectNativeProjection(created, "create mutable message");
          createdMessageUuids.push(messageUuid);
          await expect(member.page.getByText(original, { exact: true })).toBeVisible({
            timeout: 30_000,
          });

          const edited = `${runId} edited`;
          const editResponse = await liveMessengerApi<MessageRow>(
            owner.page,
            `/messages/${messageUuid}`,
            {
              method: "PUT",
              body: { payload: { kind: "markdown", content: edited } },
            },
          );
          const editedMessage = expectRow<MessageRow>(
            expectOk(editResponse, "edit message"),
            "edit message",
          );
          expect(editedMessage.uuid).toBe(messageUuid);
          expect(editedMessage.payload).toEqual({ kind: "markdown", content: edited });
          expectNativeProjection(editedMessage, "edit message");
          await expect(member.page.getByText(edited, { exact: true })).toBeVisible({
            timeout: 30_000,
          });

          const reactionResponse = await liveMessengerApi<ReactionRow>(
            moderator.page,
            "/message_reactions/",
            {
              method: "POST",
              body: { message_uuid: messageUuid, emoji_name: "thumbs_up" },
            },
          );
          const reaction = expectRow<ReactionRow>(
            expectOk(reactionResponse, "add reaction"),
            "add reaction",
          );
          reactionUuid = requireUuid(reaction.uuid, "add reaction");
          expect(reaction.message_uuid).toBe(messageUuid);
          expect(reaction.emoji_name).toBe("thumbs_up");
          expectNativeProviderProjection(reaction, "add reaction");
          await expect
            .poll(async () => {
              const row = await waitForMessageByContent(
                owner.page,
                groupStreamUuid!,
                edited,
                groupTopicUuid!,
              );
              return row.reactions?.thumbs_up ?? 0;
            })
            .toBeGreaterThan(0);

          const readResponse = await liveMessengerApi<MessageRow>(
            member.page,
            `/messages/${messageUuid}/actions/read/invoke`,
            { method: "POST" },
          );
          const readMessage = expectRow<MessageRow>(
            expectOk(readResponse, "mark message read"),
            "mark message read",
          );
          expect(readMessage.read).toBe(true);
          expectNativeProjection(readMessage, "mark message read");

          const deleteResponse = await liveMessengerApi(owner.page, `/messages/${messageUuid}`, {
            method: "DELETE",
          });
          expectOk(deleteResponse, "delete message");
          createdMessageUuids.splice(createdMessageUuids.indexOf(messageUuid), 1);
          reactionUuid = null;
          await expect(member.page.getByText(edited, { exact: true })).toHaveCount(0, {
            timeout: 30_000,
          });
        });

        await test.step("create and pin a personal folder item", async () => {
          const folderResponse = await liveMessengerApi<FolderRow>(owner.page, "/folders/", {
            method: "POST",
            body: {
              title: `${runId}-folder`,
              background_color_value: 0x336699,
            },
          });
          const folder = expectRow<FolderRow>(
            expectOk(folderResponse, "create folder"),
            "create folder",
          );
          folderUuid = requireUuid(folder.uuid, "create folder");
          expect(folder.title).toBe(`${runId}-folder`);
          expect(folder.folder_items).toEqual([]);

          const itemResponse = await liveMessengerApi<FolderItemRow>(owner.page, "/folder_items/", {
            method: "POST",
            body: {
              folder_uuid: folderUuid,
              stream_uuid: groupStreamUuid,
              chat_type: "stream",
              order_index: 0,
            },
          });
          const item = expectRow<FolderItemRow>(
            expectOk(itemResponse, "create folder item"),
            "create folder item",
          );
          folderItemUuid = requireUuid(item.uuid, "create folder item");
          expect(item.folder_uuid).toBe(folderUuid);
          expect(item.stream_uuid).toBe(groupStreamUuid);
          expect(item.pinned_at).toBeNull();

          const pinResponse = await liveMessengerApi<FolderItemRow>(
            owner.page,
            `/folder_items/${folderItemUuid}/actions/pin/invoke`,
            { method: "POST" },
          );
          const pinned = expectRow<FolderItemRow>(
            expectOk(pinResponse, "pin folder item"),
            "pin folder item",
          );
          expect(pinned.uuid).toBe(folderItemUuid);
          expect(typeof pinned.pinned_at).toBe("string");

          const unpinResponse = await liveMessengerApi<FolderItemRow>(
            owner.page,
            `/folder_items/${folderItemUuid}/actions/unpin/invoke`,
            { method: "POST" },
          );
          const unpinned = expectRow<FolderItemRow>(
            expectOk(unpinResponse, "unpin folder item"),
            "unpin folder item",
          );
          expect(unpinned.uuid).toBe(folderItemUuid);
          expect(unpinned.pinned_at).toBeNull();
        });

        await test.step("keep S3 file data out of MIME and preserve file URNs in markdown", async () => {
          const resources = [
            {
              kind: "file",
              label: "file",
              fileName: `${runId}.txt`,
              contentType: "text/plain",
              bytes: Buffer.from(`${runId} S3 attachment body`, "utf8"),
              dimensions: "",
            },
            {
              kind: "image",
              label: "image",
              fileName: `${runId}.png`,
              contentType: "image/png",
              bytes: Buffer.from(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
                "base64",
              ),
              dimensions: "&w=1&h=1",
            },
            {
              kind: "video",
              label: "video",
              fileName: `${runId}.webm`,
              contentType: "video/webm",
              bytes: Buffer.from(`${runId} S3 video object`, "utf8"),
              dimensions: "",
            },
          ] as const;
          const uploadedResources: Array<{
            contentType: string;
            fileUuid: string;
            markdown: string;
          }> = [];

          for (const resource of resources) {
            const uploadResponse = await uploadLiveMessengerFile(owner.page, {
              bytesBase64: resource.bytes.toString("base64"),
              contentType: resource.contentType,
              fileName: resource.fileName,
              streamUuid: groupStreamUuid!,
            });
            const upload = expectOk(uploadResponse, `upload S3-backed ${resource.kind}`);
            const fileUuid = requireUuid(upload.uuid, `upload S3-backed ${resource.kind}`);
            expect(upload.stream_uuid).toBe(groupStreamUuid);
            expect(upload.name).toBe(resource.fileName);
            expect(upload.content_type).toBe(resource.contentType);
            expect(upload.size_bytes).toBe(resource.bytes.length);
            const urn = `urn:${resource.kind}:${fileUuid}?name=${encodeURIComponent(resource.fileName)}&content_type=${encodeURIComponent(resource.contentType)}&size=${resource.bytes.length}${resource.dimensions}`;
            uploadedResources.push({
              contentType: resource.contentType,
              fileUuid,
              markdown:
                resource.kind === "image"
                  ? `![${resource.label}](${urn})`
                  : `[${resource.label}](${urn})`,
            });
          }

          const content = uploadedResources.map((resource) => resource.markdown).join("\n");
          const sendResponse = await liveMessengerApi<MessageRow>(owner.page, "/messages/", {
            method: "POST",
            body: {
              stream_uuid: groupStreamUuid,
              topic_uuid: groupTopicUuid,
              payload: { kind: "markdown", content },
            },
          });
          const sentMessage = expectRow<MessageRow>(
            expectOk(sendResponse, "send file URN message"),
            "send file URN message",
          );
          const messageUuid = requireUuid(sentMessage.uuid, "send file URN message");
          expectNativeProjection(sentMessage, "send file URN message");
          createdMessageUuids.push(messageUuid);

          const received = await waitForMessageByContent(
            member.page,
            groupStreamUuid!,
            content,
            groupTopicUuid!,
          );
          expect(received.payload?.content).toBe(content);
          expectNativeProjection(received, "receive file URN message");
          await expect(member.page.getByText("file", { exact: true })).toBeVisible({
            timeout: 30_000,
          });

          for (const resource of uploadedResources) {
            const downloadResponse = await liveMessengerApi(
              member.page,
              `/files/${resource.fileUuid}/actions/download`,
            );
            expect(downloadResponse.ok, "S3-backed file download failed").toBe(true);
            expect(downloadResponse.headers["content-type"]).toContain(resource.contentType);
          }
        });

        await test.step("create one stable direct stream and exchange messages in both UIs", async () => {
          const directStreamCreateBody = {
            name: `${runId}-dm`,
            description: "",
            source_name: "native",
            source: { kind: "native" },
            direct_user_uuid: userUuidByRole.member,
          };
          const createDmResponse = await liveMessengerApi<StreamRow>(owner.page, "/streams/", {
            method: "POST",
            body: directStreamCreateBody,
          });
          const dm = expectRow<StreamRow>(
            expectOk(createDmResponse, "create direct stream"),
            "create direct stream",
          );
          directStreamUuid = requireUuid(dm.uuid ?? dm.stream_uuid, "create direct stream");
          expect(dm.private).toBe(true);
          expect(dm.role).toBe("owner");
          expect(dm.direct_user_uuid).toBe(userUuidByRole.member);
          expect(dm).not.toHaveProperty("private_index");
          expectNativeProjection(dm, "create direct stream");

          await openLiveStream(owner.page, directStreamUuid);
          const ownerDmContent = `${runId} owner to member`;
          await sendLiveMessageThroughComposer(owner.page, ownerDmContent);
          const ownerDm = await waitForMessageByContent(
            owner.page,
            directStreamUuid,
            ownerDmContent,
          );
          createdMessageUuids.push(requireUuid(ownerDm.uuid, "send owner DM"));
          expectNativeProjection(ownerDm, "send owner DM");

          await member.page.reload();
          await waitForShell(member.page);
          await openLiveStream(member.page, directStreamUuid);
          await expect(member.page.getByText(ownerDmContent, { exact: true })).toBeVisible({
            timeout: 30_000,
          });
          const reply = `${runId} member reply`;
          await sendLiveMessageThroughComposer(member.page, reply);
          const memberDm = await waitForMessageByContent(member.page, directStreamUuid, reply);
          createdMessageUuids.push(requireUuid(memberDm.uuid, "send member DM"));
          expectNativeProjection(memberDm, "send member DM");
          await expect(owner.page.getByText(reply, { exact: true })).toBeVisible({
            timeout: 30_000,
          });

          const secondCreateResponse = await liveMessengerApi<StreamRow>(owner.page, "/streams/", {
            method: "POST",
            body: directStreamCreateBody,
          });
          const secondDm = expectRow<StreamRow>(
            expectOk(secondCreateResponse, "idempotent direct stream create"),
            "idempotent direct stream create",
          );
          expect(secondDm.uuid ?? secondDm.stream_uuid).toBe(directStreamUuid);
          expectNativeProjection(secondDm, "idempotent direct stream create");
        });

        await test.step("recover a missed message through epoch catch-up after reconnect", async () => {
          await openLiveStream(member.page, groupStreamUuid!, topicName);
          await member.context.setOffline(true);
          const missedContent = `${runId} catch-up message`;
          const sendResponse = await liveMessengerApi<MessageRow>(owner.page, "/messages/", {
            method: "POST",
            body: {
              stream_uuid: groupStreamUuid,
              topic_uuid: groupTopicUuid,
              payload: { kind: "markdown", content: missedContent },
            },
          });
          const missed = expectRow<MessageRow>(
            expectOk(sendResponse, "send while member is offline"),
            "send while member is offline",
          );
          const missedUuid = requireUuid(missed.uuid, "send while member is offline");
          expectNativeProjection(missed, "send while member is offline");
          createdMessageUuids.push(missedUuid);

          const catchUpResponsePromise = member.page.waitForResponse(
            (response) => {
              const request = response.request();
              const url = new URL(response.url());
              return (
                request.method() === "GET" &&
                url.pathname === "/api/workspace/v1/events/" &&
                url.searchParams.has("epoch_version>") &&
                url.searchParams.get("page_limit") === "500"
              );
            },
            { timeout: 30_000 },
          );
          await member.context.setOffline(false);
          const catchUpResponse = await catchUpResponsePromise;
          expect(catchUpResponse.ok()).toBe(true);
          const catchUpEvents = expectRows<WorkspaceEventRow>(
            await catchUpResponse.json(),
            "realtime catch-up",
          );
          const messageEvent = catchUpEvents.find(
            (event) =>
              event.payload?.kind === "message.created" && event.payload.uuid === missedUuid,
          );
          expect(messageEvent, "catch-up did not return the missed message event").toBeDefined();
          expect(messageEvent?.schema_version).toBe(1);
          expect(messageEvent?.object_type).toBe("message");
          expect(messageEvent?.action).toBe("created");
          expect(messageEvent?.epoch_version).toEqual(expect.any(Number));
          expect(messageEvent).not.toHaveProperty("kind");
          expect(messageEvent).not.toHaveProperty("stream_uuid");
          expect(messageEvent).not.toHaveProperty("topic_uuid");
          expect(messageEvent?.payload?.stream_uuid).toBe(groupStreamUuid);
          expect(messageEvent?.payload?.topic_uuid).toBe(groupTopicUuid);
          expect(messageEvent?.payload?.author_uuid).toBe(userUuidByRole.owner);
          expect(messageEvent?.payload?.read).toBe(false);
          expect(messageEvent?.payload?.is_own).toBe(false);
          expectNativeProjection(messageEvent!.payload!, "realtime catch-up message event");
          await expect(member.page.getByText(missedContent, { exact: true })).toBeVisible({
            timeout: 30_000,
          });
        });

        await test.step("reload from the server-backed mailbox without duplicates", async () => {
          await member.page.reload();
          await waitForShell(member.page);
          await openLiveStream(member.page, groupStreamUuid!, topicName);
          const persistedContent = `${runId} catch-up message`;
          await expect(member.page.getByText(persistedContent, { exact: true })).toHaveCount(1, {
            timeout: 30_000,
          });
          const messages = await fetchMessages(member.page, groupStreamUuid!, groupTopicUuid!);
          expect(messages.filter((row) => row.payload?.content === persistedContent)).toHaveLength(
            1,
          );
        });
      });
    } finally {
      const ownerPage = sessions.owner?.page;
      const moderatorPage = sessions.moderator?.page;
      if (moderatorPage != null && reactionUuid != null) {
        await bestEffort(moderatorPage, "DELETE", `/message_reactions/${reactionUuid}`);
      }
      if (ownerPage != null) {
        for (const messageUuid of [...createdMessageUuids].reverse()) {
          await bestEffort(ownerPage, "DELETE", `/messages/${messageUuid}`);
        }
        if (folderItemUuid != null) {
          await bestEffort(ownerPage, "DELETE", `/folder_items/${folderItemUuid}`);
        }
        if (folderUuid != null) {
          await bestEffort(ownerPage, "DELETE", `/folders/${folderUuid}`);
        }
        if (groupTopicUuid != null) {
          await bestEffort(ownerPage, "DELETE", `/stream_topics/${groupTopicUuid}`);
        }
        if (directStreamUuid != null) {
          await bestEffort(ownerPage, "DELETE", `/streams/${directStreamUuid}`);
        }
        if (groupStreamUuid != null) {
          await bestEffort(ownerPage, "DELETE", `/streams/${groupStreamUuid}`);
        }
      }
      await closeLiveMessengerSessions(sessions);
    }
  });
});
