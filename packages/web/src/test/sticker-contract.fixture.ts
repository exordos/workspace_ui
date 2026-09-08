import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceStickerDto } from "~/shared/api/messenger-stickers.api";
export const STICKER_ID = "11111111-1111-4111-8111-111111111111";
export const OTHER_STICKER_ID = "22222222-2222-4222-8222-222222222222";
export function stickerDto(id = STICKER_ID, favorite = false): WorkspaceStickerDto {
  return {
    id,
    title: "Celebration",
    alt_text: "Happy celebration",
    emoji: ["🎉"],
    tags: ["celebration"],
    category: "sticker",
    media: { format: "gif", url: `/api/workspace/v1/messenger/stickers/${id}/actions/download` },
    is_favorite: favorite,
  };
}
export function stickerSession(user = "user-a", generation = 1, projectId = "project-a") {
  const accountId = `${user}:${projectId}`;
  useWorkspaceAuthStore.setState({
    currentAccountId: accountId,
    sessions: [
      {
        accountId,
        instanceId: "instance-a",
        organizationId: "org-a",
        organizationOrigin: "https://org-a.example.com",
        projectId,
        userUuid: user,
        login: "fixture",
        accessToken: "fixture-access-token",
        expiresAtMs: Date.now() + 3600000,
        profile: {
          uuid: user,
          username: "fixture",
          firstName: "Fixture",
          lastName: "User",
          email: "fixture@example.com",
          status: "active",
        },
        runtimeGeneration: generation,
      },
    ],
    runtimeGeneration: generation,
  });
}
export function stickerPageResponse(items: WorkspaceStickerDto[], marker?: string) {
  return new Response(JSON.stringify(items), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "X-Pagination-Limit": "50",
      ...(marker ? { "X-Pagination-Marker": marker } : {}),
    },
  });
}

export function requestUrl(input: RequestInfo | URL | undefined): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : (input?.url ?? "");
}
