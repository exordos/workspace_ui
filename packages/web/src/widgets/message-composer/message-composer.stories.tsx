import { expect, fn, userEvent, within } from "storybook/test";
import { t } from "~/i18n/i18n";
import { MessageComposer } from "./message-composer.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Widgets/MessageComposer/EncryptedSpoiler",
  component: MessageComposer,
  parameters: { layout: "padded" },
  args: {
    secretFragments: { canRotate: true },
    onSend: fn(),
    capabilities: {
      upload: { mode: "unsupported" },
      savedSnippets: { mode: "unsupported" },
      scheduledSend: { mode: "unsupported" },
    },
  },
  render: (args) => (
    <div className="bg-bg-primary mx-auto max-w-3xl p-4">
      <MessageComposer
        {...args}
        initialValue={args.initialValue ?? `${t("composer.linkText")} :::example-secret:::`}
      />
    </div>
  ),
} satisfies Meta<typeof MessageComposer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Owner: Story = {};
export const Member: Story = { args: { secretFragments: { canRotate: false } } };
export const Sending: Story = { args: { disabled: true } };
export const Multiline: Story = {
  args: { initialValue: ":::first private line\nsecond private line:::" },
};
export const StartBeforeTyping: Story = {
  args: { initialValue: "" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const expand = canvas.queryByRole("button", { name: t("composer.expandToolbar") });
    if (expand) await userEvent.click(expand);
    const spoiler = canvas.getByRole("button", { name: t("composer.secretSpoiler") });
    await userEvent.hover(spoiler);
    const page = within(canvasElement.ownerDocument.body);
    await expect(page.getByRole("tooltip")).toHaveTextContent(t("composer.secretSpoilerHint"));
  },
};
