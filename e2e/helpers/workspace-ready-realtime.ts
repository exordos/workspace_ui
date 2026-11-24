import type { Page, WebSocketRoute } from "@playwright/test";

/** Complete the initial catch-up against the default Workspace mock epoch. */
export async function installWorkspaceReadyRealtime(
  page: Page,
  {
    readyDelayMs = 0,
    onConnection,
  }: {
    readyDelayMs?: number;
    onConnection?: (socket: WebSocketRoute) => void;
  } = {},
): Promise<void> {
  await page.routeWebSocket(
    (url) => url.pathname === "/api/workspace/v1/events/ws",
    (socket) => {
      onConnection?.(socket);
      setTimeout(() => {
        socket.send(
          JSON.stringify({
            type: "ready",
            epoch_generation: "e2e-generation-1",
            epoch_version: 1,
          }),
        );
      }, readyDelayMs);
    },
  );
}
