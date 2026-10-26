import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import { renderWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-render.lib";
import { EncryptedSecretFragmentPresentation } from "./encrypted-secret-fragment.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Features/Encrypted chat/Secret fragment",
  component: EncryptedSecretFragmentPresentation,
  args: { status: "missing-key", rendered: null },
  decorators: [
    (Story) => (
      <div className="max-w-lg rounded-lg bg-msg-bg p-3 text-sm text-text-primary">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EncryptedSecretFragmentPresentation>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Locked: Story = { args: { onRequestKey: () => undefined } };
export const LockedWithoutRequest: Story = {};
export const Loading: Story = { args: { status: "loading" } };
export const RequestPending: Story = {
  args: { onRequestKey: () => undefined, requestPending: true },
};
export const Readable: Story = {
  args: {
    status: "ready",
    rendered: renderWorkspaceMessageBody(parseWorkspaceMessageBody("**Synthetic** `password-123`")),
  },
};
export const Failed: Story = {
  args: { status: "error", onRetry: () => undefined, onRequestKey: () => undefined },
};
