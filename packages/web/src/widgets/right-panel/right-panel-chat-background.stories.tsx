import { useEffect } from "react";
import { MemoryRouter } from "react-router-dom";
import { expect, userEvent, waitFor, within } from "storybook/test";
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

/** Exercises the footer geometry that previously wrapped the primary action in Russian. */
export const Confirmation: Story = {
  globals: { locale: "ru", mode: "dark" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: t("chatBackground.title") }));
    await userEvent.click(canvas.getByRole("button", { name: t("chatBackground.sea") }));
    const body = within(canvasElement.ownerDocument.body);
    const dialog = body.getByRole("dialog", { name: t("chatBackground.applyTitle") });
    const actions = ["common.cancel", "chatBackground.applyChat", "chatBackground.applyAll"].map(
      (key) => within(dialog).getByRole("button", { name: t(key) }),
    );
    await waitFor(async () => {
      const rects = actions.map((button) => button.getBoundingClientRect());
      await expect(rects.every((rect) => rect.height >= 32 && rect.width > 0)).toBe(true);
      const tops = rects.map((rect) => rect.top);
      if (canvasElement.ownerDocument.defaultView!.innerWidth >= 640) {
        await expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
      } else {
        await expect(tops[1]).toBeGreaterThan(tops[0]!);
        await expect(tops[2]).toBeGreaterThan(tops[1]!);
      }
      for (const button of actions)
        await expect(button.scrollWidth).toBeLessThanOrEqual(button.clientWidth);
    });
  },
};
