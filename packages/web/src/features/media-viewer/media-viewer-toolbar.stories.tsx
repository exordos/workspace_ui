import { MediaViewerToolbar } from "./media-viewer-toolbar.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Features/Media viewer/Toolbar",
  component: MediaViewerToolbar,
  args: {
    actionsEnabled: true,
    showCopy: true,
    copyKey: "image",
    showOpenInNewTab: true,
    onCopy: () => Promise.resolve(true),
    onDownload: () => undefined,
    onOpenInNewTab: () => undefined,
    onClose: () => undefined,
  },
  decorators: [
    (Story) => (
      <div className="bg-bg-primary relative h-20">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MediaViewerToolbar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Image: Story = {};
export const ImageLoading: Story = { args: { actionsEnabled: false } };
export const Video: Story = { args: { showCopy: false } };
