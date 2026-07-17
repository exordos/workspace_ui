import { expect, test } from "./fixtures";
import { seedAuthStorage } from "./helpers/seed-auth";
import { e2eOrgBasePath, E2E_STREAM_UUID, E2E_TOPIC_UUID } from "./helpers/navigate-messenger";
import {
  E2E_ACCOUNT_ID,
  E2E_INSTANCE_ID,
  E2E_ORGANIZATION_ID,
  E2E_PROJECT_ID,
  E2E_USER_UUID,
} from "./mocks/workspace-default-responses";
import type { WebSocketRoute } from "@playwright/test";

const WORKSPACE_EVENTS_SOCKET_PATH = "/api/workspace/v1/events/ws";
const RESUME_CURSOR = {
  epochGeneration: "e2e-resume-generation",
  epochVersion: 41,
};
const READY_CURSOR = {
  epochGeneration: RESUME_CURSOR.epochGeneration,
  epochVersion: 42,
};
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

test.describe("Workspace realtime @mock", () => {
  test("uses the Workspace socket cursor and reboots after an expired socket cursor", async ({
    page,
  }) => {
    const socketUrls: string[] = [];
    const socketProtocols: string[][] = [];
    const sockets: WebSocketRoute[] = [];
    let epochRequests = 0;
    let recoveringFromExpiredCursor = false;

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
    expect(firstSocketUrl.searchParams.get("last_epoch_version")).toBe("41");
    expect(firstSocketUrl.searchParams.get("epoch_generation")).toBe(RESUME_CURSOR.epochGeneration);
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
