import { useLayoutEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { adaptMessengerStream } from "~/entities/messenger/messenger-adapters.lib";
import type { WorkspaceRightPanelChannelInfoView } from "~/entities/messenger/messenger-right-panel.lib";
import { useMessengerStore } from "~/entities/messenger/messenger.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import { t } from "~/i18n/i18n";
import type { WorkspaceMessengerStreamDto } from "~/shared/api/messenger.types";
import { RightPanelWorkspaceInfo } from "./right-panel-workspace-info.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const STREAM_UUID = "2f2d7b9d-bee1-4917-a3d1-ef740eac4490";
const OWNER_UUID = "d6ed5ab9-937b-4fbb-981e-736e829a04d1";
const MEMBER_UUID = "dd51764e-9da3-4249-acb4-b381fbca6683";
const PROJECT_UUID = "9cdfac55-c8e1-4d18-8f13-40eef819a939";
const DATE = "2026-01-01T00:00:00Z";
const STREAM: WorkspaceRightPanelChannelInfoView = {
  kind: "channel",
  streamUuid: STREAM_UUID,
  title: "Engineering",
  description: "Release coordination and architecture discussions.",
  color: null,
  participantsCount: 0,
  onlineCount: 0,
  members: [],
  topics: [],
  notificationMode: "all_messages",
};

function ChannelSettingsPreview({
  checked,
  viewer,
}: Readonly<{ checked: boolean; viewer: "owner" | "member" }>) {
  const ready = useMessengerStore((state) => state.streamsById[STREAM_UUID] !== undefined);

  useLayoutEffect(() => {
    const auth = useWorkspaceAuthStore.getState();
    const catalog = useMessengerStore.getState();
    const fetchOriginal = window.fetch;
    const userUuid = viewer === "owner" ? OWNER_UUID : MEMBER_UUID;
    const session = {
      accountId: `storybook-${viewer}`,
      instanceId: "storybook",
      organizationId: "storybook",
      organizationOrigin: window.location.origin,
      projectId: PROJECT_UUID,
      userUuid,
      accessToken: "storybook-fixture",
      runtimeGeneration: 0,
      login: `${viewer}@example.invalid`,
      profile: {
        uuid: userUuid,
        username: viewer,
        firstName: null,
        lastName: null,
        email: null,
      },
    };
    let dto: WorkspaceMessengerStreamDto = {
      uuid: STREAM_UUID,
      name: STREAM.title,
      description: STREAM.description ?? "",
      project_id: PROJECT_UUID,
      owner: OWNER_UUID,
      user_uuid: userUuid,
      role: viewer,
      notification_mode: "all_messages",
      unread_count: 0,
      active_unread_count: 0,
      passive_unread_count: 0,
      source_name: "native",
      invite_only: false,
      announce: false,
      private: false,
      encryption: true,
      current_encryption_key_uuid: "36e811cc-52c8-4abd-9a43-d93f3e4b4212",
      allow_key_sharing_by_holders: checked,
      is_archived: false,
      created_at: DATE,
      updated_at: DATE,
    };
    const fetchPreview: typeof window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input, window.location.origin);
      if (url.pathname !== `/api/workspace/v1/messenger/streams/${STREAM_UUID}`) {
        return fetchOriginal(input, init);
      }
      if (init?.method !== "PUT" || typeof init.body !== "string") {
        return new Response(null, { status: 405 });
      }
      if (viewer === "member") return new Response(null, { status: 403 });
      const request = JSON.parse(init.body) as { allow_key_sharing_by_holders: boolean };
      dto = {
        ...dto,
        allow_key_sharing_by_holders: request.allow_key_sharing_by_holders,
        updated_at: new Date().toISOString(),
      };
      return Response.json(dto);
    };
    window.fetch = fetchPreview;
    useWorkspaceAuthStore.setState({ sessions: [session], currentAccountId: session.accountId });
    const ownerKey = workspaceRuntimeOwnerKey(session);
    catalog.startBootstrap(ownerKey);
    catalog.upsertStream(ownerKey, adaptMessengerStream(dto));
    return () => {
      if (window.fetch === fetchPreview) window.fetch = fetchOriginal;
      useMessengerStore.setState(catalog);
      useWorkspaceAuthStore.setState(auth);
    };
  }, [checked, viewer]);

  if (!ready) return null;
  return (
    <MemoryRouter>
      <aside className="bg-sidebar flex h-[540px] w-[360px] flex-col rounded-lg border border-border-subtle">
        <header className="border-b border-border-subtle px-4 py-3 text-sm font-medium text-text-primary">
          {t("channel.channelSettings")}
        </header>
        <RightPanelWorkspaceInfo info={STREAM} chatScreen="settings" />
      </aside>
    </MemoryRouter>
  );
}

const meta = {
  title: "Widgets/RightPanel/StreamKeySharing",
  component: ChannelSettingsPreview,
  parameters: { layout: "padded" },
} satisfies Meta<typeof ChannelSettingsPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const OwnerOff: Story = { args: { checked: false, viewer: "owner" } };
export const MemberOn: Story = { args: { checked: true, viewer: "member" } };
