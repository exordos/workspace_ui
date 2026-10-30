import { useState } from "react";
import { WorkspaceMessageBody } from "~/entities/messenger/messenger-workspace-message-body.ui";
import { useTranslation } from "~/i18n/i18n";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import { renderWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-render.lib";
import { MessageComposer } from "./message-composer.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

function TimeInsertionExample({ disabled = false }: Readonly<{ disabled?: boolean }>) {
  const { t } = useTranslation();
  const [markdown, setMarkdown] = useState("<urn:time:2026-10-13T10:02:00Z>");
  const rendered = renderWorkspaceMessageBody(parseWorkspaceMessageBody(markdown));
  return (
    <div className="mx-auto flex min-h-[620px] max-w-3xl flex-col gap-4 bg-bg p-4 text-text-primary">
      <div className="rounded-xl border border-border-subtle bg-bg-elevated p-4">
        <WorkspaceMessageBody
          html={rendered.html}
          metadata={rendered.metadata}
          useInlineMeta={false}
        />
        <pre className="mt-3 overflow-x-auto text-xs text-text-muted">{markdown}</pre>
      </div>
      <div className="mt-auto">
        <MessageComposer
          disabled={disabled}
          placeholder={t("composer.insertTime")}
          initialValue=""
          onSend={(content) => {
            setMarkdown(content);
          }}
        />
      </div>
    </div>
  );
}

const meta = {
  title: "Widgets/MessageComposer/DateTimeInsertion",
  component: MessageComposer,
  parameters: { layout: "padded" },
  render: (args) => <TimeInsertionExample disabled={args.disabled} />,
} satisfies Meta<typeof MessageComposer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground: Story = {};
export const Disabled: Story = { args: { disabled: true } };
