import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import { ChatBackground } from "~/features/chat-background/chat-background.ui";
import { t } from "~/i18n/i18n";
import { RightPanelUserAppearance } from "./right-panel-user-settings.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const project = "e0000000-0000-4000-8000-000000000001";
const user = "e0000000-0000-4000-8000-000000000002";
const stream = "e0000000-0000-4000-8000-000000000004";
const topic = "e0000000-0000-4000-8000-000000000005";
const route = `/org/backgrounds.example.invalid/project/${project}/stream/${stream}/topic/${topic}`;
const noAction = () => {};

function BackgroundExample() {
  useEffect(() => {
    const previous = useWorkspaceAuthStore.getState();
    useWorkspaceAuthStore.setState({
      sessions: [
        {
          accountId: "storybook-chat-backgrounds",
          instanceId: "storybook-instance",
          organizationId: "backgrounds.example.invalid",
          organizationOrigin: "https://backgrounds.example.invalid",
          projectId: project,
          userUuid: user,
          runtimeGeneration: 1,
          accessToken: "synthetic-story-access",
          refreshToken: "synthetic-story-refresh",
          login: "fixture@example.invalid",
          profile: {
            uuid: user,
            username: "fixture",
            firstName: null,
            lastName: null,
            email: null,
          },
        },
      ],
      currentAccountId: "storybook-chat-backgrounds",
      runtimeGeneration: 1,
    });
    return () => useWorkspaceAuthStore.setState(previous);
  }, []);
  return (
    <MemoryRouter initialEntries={[route]}>
      <div className="flex h-screen min-h-0 gap-2 bg-bg p-2 text-text-primary">
        <ChatBackground conversationId={`topic:${stream}:${topic}`}>
          <div className="m-4 self-start rounded-lg bg-bg-elevated p-4 shadow-sm">
            <p>{t("chatBackground.title")}</p>
          </div>
        </ChatBackground>
        <aside className="flex w-80 shrink-0 flex-col rounded-lg bg-bg-elevated">
          <RightPanelUserAppearance onBack={noAction} onClose={noAction} />
        </aside>
      </div>
    </MemoryRouter>
  );
}

const meta = {
  title: "Widgets/Right panel/Chat backgrounds",
  component: RightPanelUserAppearance,
  args: { onBack: noAction, onClose: noAction },
  parameters: { layout: "fullscreen" },
  render: () => <BackgroundExample />,
} satisfies Meta<typeof RightPanelUserAppearance>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Appearance: Story = {};
