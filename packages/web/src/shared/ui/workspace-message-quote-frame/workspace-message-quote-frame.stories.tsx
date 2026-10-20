import { t } from "~/i18n/i18n";
import {
  MESSAGE_BUBBLE_BODY_CLASS_NAME,
  MESSAGE_MEDIA_THUMBNAIL_CLASS_NAME,
} from "~/shared/lib/message-body-rich-text-classes";
import { Icon } from "~/shared/ui/icon";
import { WorkspaceMessageQuoteFrame } from "./workspace-message-quote-frame.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement } from "react";

const meta = {
  title: "Shared/Content/WorkspaceMessageQuoteFrame",
  component: WorkspaceMessageQuoteFrame,
  args: { header: "Alex Morgan", surface: "message" },
  render: (args) => (
    <WorkspaceMessageQuoteFrame {...args}>
      <p className="text-sm text-text-primary">{t("settings.statusDialogHint")}</p>
    </WorkspaceMessageQuoteFrame>
  ),
  argTypes: { children: { control: false }, leading: { control: false } },
} satisfies Meta<typeof WorkspaceMessageQuoteFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Composer: Story = { args: { surface: "composer" } };
export const MutedHeader: Story = { args: { headerMuted: true } };
export const WithLeadingMedia: Story = { args: { leading: <Icon name="images" size={32} /> } };
export const LongHeader: Story = {
  args: { header: "Alex Morgan With A Very Long Display Name For Narrow Panels" },
};

function MediaThumbnail(): ReactElement {
  const image = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#7087ff"/><circle cx="50" cy="50" r="28" fill="#cde6ff"/></svg>`;
  return (
    <div className="relative min-h-12 w-12 shrink-0 self-stretch overflow-hidden rounded-md bg-bg-elevated">
      <img
        className={`${MESSAGE_MEDIA_THUMBNAIL_CLASS_NAME} absolute inset-0 h-full w-full object-cover`}
        src={`data:image/svg+xml,${encodeURIComponent(image)}`}
        alt=""
      />
    </div>
  );
}

export const NestedMedia: Story = {
  render: (args) => (
    <div className={`${MESSAGE_BUBBLE_BODY_CLASS_NAME} w-80 max-w-full`}>
      <WorkspaceMessageQuoteFrame {...args} leading={<MediaThumbnail />} fullWidthBody>
        <div className={MESSAGE_BUBBLE_BODY_CLASS_NAME}>
          <WorkspaceMessageQuoteFrame header="Sam Lee" leading={<MediaThumbnail />}>
            <p className="text-sm">{t("settings.statusDialogHint")}</p>
          </WorkspaceMessageQuoteFrame>
          <p className="text-sm">{t("settings.statusDialogHint")}</p>
        </div>
      </WorkspaceMessageQuoteFrame>
    </div>
  ),
};
