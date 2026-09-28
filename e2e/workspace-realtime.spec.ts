import { expect, test } from "./fixtures";
import { seedAuthStorage } from "./helpers/seed-auth";
import { e2eOrgBasePath, E2E_STREAM_UUID, E2E_TOPIC_UUID } from "./helpers/navigate-messenger";
import {
  E2E_ACCOUNT_ID,
  E2E_INSTANCE_ID,
  E2E_ORGANIZATION_ID,
  E2E_PROJECT_ID,
  E2E_USER_UUID,
  foldersSuccess,
  streamsSuccess,
} from "./mocks/workspace-default-responses";
import type { WebSocketRoute } from "@playwright/test";

const WORKSPACE_EVENTS_SOCKET_PATH = "/api/workspace/v1/events/ws";
const RESUME_CURSOR = {
  epochGeneration: "e2e-resume-generation",
  epochVersion: 41,
};
const READY_CURSOR = {
  epochGeneration: RESUME_CURSOR.epochGeneration,
  epochVersion: 101,
};
const BOOTSTRAP_CURSOR = { ...READY_CURSOR, epochVersion: 100 };
const RECOVERED_CURSOR = {
  epochGeneration: "e2e-generation-1",
  epochVersion: 0,
};

function realtimeCursorStorageKey(): string {
  return [
    "workspace-realtime:cursor",
    "account",
    E2E_ACCOUNT_ID,
    "instance",
    E2E_INSTANCE_ID,
    "organization",
    E2E_ORGANIZATION_ID,
    "project",
    E2E_PROJECT_ID,
    "user",
    E2E_USER_UUID,
  ].join(":");
}

function createGate() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}

test.describe("Workspace realtime @mock", () => {
  test("waits for epoch and bootstrap, replays their gap, then resumes from the applied cursor", async ({
    page,
  }) => {
    const epochGate = createGate();
    const foldersGate = createGate();
    const eventCursors: string[] = [];
    const sockets: WebSocketRoute[] = [];
    let epochRequests = 0;
    let streamRequests = 0;
    let folderRequests = 0;
    let mentionsRequests = 0;

    await page.route(
      (url) =>
        url.pathname.endsWith("/messenger/messages/") &&
        url.searchParams.get("mentioned") === "true" &&
        url.searchParams.get("read") === "false",
      async (route) => {
        mentionsRequests += 1;
        await route.fulfill({ json: [] });
      },
    );

    await page.route(
      (url) => url.pathname.endsWith("/epoch/"),
      async (route) => {
        epochRequests += 1;
        await epochGate.promise;
        await route.fulfill({
          json: {
            epoch_version: BOOTSTRAP_CURSOR.epochVersion,
            current_epoch_version: BOOTSTRAP_CURSOR.epochVersion,
            epoch_generation: BOOTSTRAP_CURSOR.epochGeneration,
            minimum_epoch_version: 1,
          },
        });
      },
    );
    await page.route(
      (url) => url.pathname.endsWith("/messenger/streams/"),
      async (route) => {
        streamRequests += 1;
        await route.fallback();
      },
    );
    await page.route(
      (url) => url.pathname.endsWith("/messenger/folders/"),
      async (route) => {
        folderRequests += 1;
        await foldersGate.promise;
        await route.fulfill({ json: foldersSuccess() });
      },
    );
    await page.route(
      (url) => url.pathname.endsWith("/events/"),
      async (route) => {
        const url = new URL(route.request().url());
        const cursor = url.searchParams.get("epoch_version>") ?? "";
        eventCursors.push(cursor);
        expect(url.searchParams.get("epoch_generation")).toBe(BOOTSTRAP_CURSOR.epochGeneration);
        const stream = streamsSuccess()[0];
        await route.fulfill({
          json:
            cursor === String(BOOTSTRAP_CURSOR.epochVersion)
              ? [
                  {
                    schema_version: 1,
                    uuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                    epoch_version: READY_CURSOR.epochVersion,
                    project_id: E2E_PROJECT_ID,
                    user_uuid: E2E_USER_UUID,
                    object_type: "stream",
                    action: "updated",
                    created_at: "2026-09-25T10:00:00.000Z",
                    updated_at: "2026-09-25T10:00:00.000Z",
                    payload: {
                      ...stream,
                      kind: "stream.updated",
                      name: "Synced after bootstrap",
                      updated_at: "2026-09-25T10:00:00.000Z",
                    },
                  },
                ]
              : [],
        });
      },
    );
    await page.routeWebSocket(
      (url) => url.pathname === WORKSPACE_EVENTS_SOCKET_PATH,
      (socket) => {
        sockets.push(socket);
        socket.send(
          JSON.stringify({
            type: "ready",
            epoch_generation: READY_CURSOR.epochGeneration,
            epoch_version: READY_CURSOR.epochVersion,
          }),
        );
      },
    );

    try {
      await seedAuthStorage(page);
      await page.evaluate(({ key, cursor }) => localStorage.setItem(key, JSON.stringify(cursor)), {
        key: realtimeCursorStorageKey(),
        cursor: RESUME_CURSOR,
      });
      await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);

      await expect.poll(() => epochRequests).toBeGreaterThan(0);
      await expect.poll(() => mentionsRequests).toBe(1);
      expect(streamRequests).toBe(0);
      expect(eventCursors).toEqual([]);
      expect(sockets).toHaveLength(0);
      expect(mentionsRequests).toBe(1);
      epochGate.release();

      await expect.poll(() => folderRequests).toBeGreaterThan(0);
      expect(streamRequests).toBeGreaterThan(0);
      expect(eventCursors).toEqual([]);
      expect(sockets).toHaveLength(0);
      expect(
        await page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
          realtimeCursorStorageKey(),
        ),
      ).toEqual(RESUME_CURSOR);
      foldersGate.release();

      await expect.poll(() => sockets.length).toBe(1);
      await expect.poll(() => mentionsRequests).toBe(2);
      expect(eventCursors).toEqual([String(BOOTSTRAP_CURSOR.epochVersion)]);
      expect(new URL(sockets[0]!.url()).searchParams.get("last_epoch_version")).toBe("101");
      await expect(
        page.getByRole("link", { name: "#Synced after bootstrap", exact: true }),
      ).toBeVisible();

      const epochRequestsBeforeReconnect = epochRequests;
      const streamRequestsBeforeReconnect = streamRequests;
      await sockets[0]!.close({ code: 1011, reason: "test reconnect" });
      await expect.poll(() => sockets.length).toBe(2);
      expect(eventCursors).toEqual(["100", "101"]);
      expect(epochRequests).toBe(epochRequestsBeforeReconnect);
      expect(streamRequests).toBe(streamRequestsBeforeReconnect);
    } finally {
      epochGate.release();
      foldersGate.release();
    }
  });

  test("uses the Workspace socket cursor and reboots after an expired socket cursor", async ({
    page,
  }) => {
    const socketUrls: string[] = [];
    const socketProtocols: string[][] = [];
    const sockets: WebSocketRoute[] = [];
    let epochRequests = 0;
    let recoveringFromExpiredCursor = false;

    await page.route(
      (url) => url.pathname.endsWith("/epoch/"),
      async (route) => {
        const cursor = recoveringFromExpiredCursor ? RECOVERED_CURSOR : BOOTSTRAP_CURSOR;
        await route.fulfill({
          json: {
            epoch_version: cursor.epochVersion,
            epoch_generation: cursor.epochGeneration,
            current_epoch_version: cursor.epochVersion,
            minimum_epoch_version: 0,
          },
        });
      },
    );

    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/workspace/v1/epoch/") {
        epochRequests += 1;
      }
    });

    await page.routeWebSocket(
      (url) => url.pathname === WORKSPACE_EVENTS_SOCKET_PATH,
      (socket) => {
        socketUrls.push(socket.url());
        socketProtocols.push(socket.protocols());
        sockets.push(socket);

        const cursor = recoveringFromExpiredCursor ? RECOVERED_CURSOR : READY_CURSOR;
        setTimeout(() => {
          socket.send(
            JSON.stringify({
              type: "ready",
              epoch_generation: cursor.epochGeneration,
              epoch_version: cursor.epochVersion,
            }),
          );
        }, 0);
      },
    );

    await seedAuthStorage(page, "e2e-realtime-access-token");
    await page.evaluate(({ key, cursor }) => localStorage.setItem(key, JSON.stringify(cursor)), {
      key: realtimeCursorStorageKey(),
      cursor: RESUME_CURSOR,
    });
    await page.goto(`${e2eOrgBasePath()}/stream/${E2E_STREAM_UUID}/topic/${E2E_TOPIC_UUID}`);

    await expect.poll(() => socketUrls.length).toBeGreaterThanOrEqual(1);
    const firstSocketUrl = new URL(socketUrls[0] ?? "");
    expect(firstSocketUrl.pathname).toBe(WORKSPACE_EVENTS_SOCKET_PATH);
    expect(firstSocketUrl.searchParams.get("last_epoch_version")).toBe("100");
    expect(firstSocketUrl.searchParams.get("epoch_generation")).toBe(
      BOOTSTRAP_CURSOR.epochGeneration,
    );
    expect(socketProtocols[0]).toEqual(["workspace.events.v1", "bearer.e2e-realtime-access-token"]);

    await expect
      .poll(() =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
          realtimeCursorStorageKey(),
        ),
      )
      .toEqual(READY_CURSOR);

    const activeSocket = sockets.at(-1);
    if (activeSocket == null) {
      throw new Error("Expected the routed Workspace realtime socket");
    }
    const connectionsBeforeRecovery = socketUrls.length;
    const epochRequestsBeforeRecovery = epochRequests;
    recoveringFromExpiredCursor = true;
    await activeSocket.close({ code: 4410, reason: "epoch_pruned" });

    await expect
      .poll(() => epochRequests, { timeout: 20_000 })
      .toBeGreaterThan(epochRequestsBeforeRecovery);
    await expect
      .poll(() => socketUrls.length, { timeout: 20_000 })
      .toBeGreaterThan(connectionsBeforeRecovery);
    await expect
      .poll(() =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
          realtimeCursorStorageKey(),
        ),
      )
      .toEqual(RECOVERED_CURSOR);
  });
});
