import { fn } from "storybook/test";
import { t } from "~/i18n/i18n";
import {
  AttachmentCard,
  AttachmentCardList,
  AttachmentErrorCard,
  AttachmentPendingCard,
  AttachmentReadyCard,
  AttachmentUploadingCard,
} from "./attachment-card.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const PREVIEW =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Crect width='80' height='80' fill='%23888'/%3E%3Ccircle cx='40' cy='40' r='24' fill='%23ddd'/%3E%3C/svg%3E";
const meta = {
  title: "Shared/Content/AttachmentCard",
  component: AttachmentReadyCard,
  args: {
    fileName: "roadmap.pdf",
    contentType: "application/pdf",
    sizeBytes: 24576,
    onRemove: fn(),
  },
  render: (args) => <AttachmentCard status="file" {...args} />,
  decorators: [
    (Story) => (
      <div role="list" aria-label={t("attachmentCard.list")}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AttachmentReadyCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const ReadyImage: Story = {
  args: {
    fileName: "preview.svg",
    contentType: "image/svg+xml",
    previewUrl: PREVIEW,
  },
  render: (args) => (
    <AttachmentCard {...args} status="image" previewUrl={args.previewUrl ?? PREVIEW} />
  ),
};
export const States: Story = {
  render: () => (
    <AttachmentCardList ariaLabel={t("attachmentCard.list")}>
      <AttachmentReadyCard fileName="roadmap.pdf" sizeBytes={24576} onRemove={fn()} />
      <AttachmentReadyCard
        fileName="preview.svg"
        previewUrl={PREVIEW}
        appearance="embedded"
        onRemove={fn()}
      />
      <AttachmentPendingCard
        fileName="report.pdf"
        detailText={t("attachmentCard.validating")}
        onRemove={fn()}
      />
      <AttachmentCard
        status="queued"
        fileName="notes.txt"
        detailText={t("attachmentCard.queued")}
        onRemove={fn()}
      />
      <AttachmentUploadingCard fileName="meeting.mp4" progress={48} onCancel={fn()} />
      <AttachmentErrorCard fileName="report.pdf" onRetry={fn()} onRemove={fn()} />
    </AttachmentCardList>
  ),
};
export const LongFileName: Story = {
  args: { fileName: "Workspace design review with a very long filename and many revisions.pdf" },
};
