import { t } from "~/i18n/i18n";
import { FloatingLoadingOverlay } from "./floating-loading-overlay";
import { Skeleton, SkeletonRect, SkeletonText } from "./skeleton.ui";
import { Spinner } from "./spinner.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Shared/Feedback/Loading",
  component: Spinner,
  args: { size: "md", variant: "accent" },
  argTypes: {
    size: { control: "select", options: ["sm", "md", "lg"] },
    variant: { control: "select", options: ["accent", "inherit"] },
  },
} satisfies Meta<typeof Spinner>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const SpinnerSizes: Story = {
  render: () => (
    <div
      className="flex items-center gap-6 text-accent"
      role="status"
      aria-label={t("app.loading")}
    >
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
      <Spinner variant="inherit" />
    </div>
  ),
};
export const SkeletonFamily: Story = {
  render: () => (
    <div className="max-w-sm space-y-4" role="status" aria-label={t("app.loading")}>
      <Skeleton className="h-10 w-10 rounded-full" />
      <SkeletonText />
      <SkeletonText className="h-4 w-1/2" />
      <SkeletonRect />
      <Skeleton className="h-6 w-full" animated={false} />
    </div>
  ),
};
export const OverlayPositions: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-2">
      {(
        [
          "top-left",
          "top-center",
          "top-right",
          "bottom-left",
          "bottom-center",
          "bottom-right",
          "left-center",
          "right-center",
        ] as const
      ).map((position) => (
        <div
          key={position}
          className="relative h-40 rounded-lg border border-border-subtle bg-card-bg p-6"
        >
          <SkeletonRect />
          <FloatingLoadingOverlay visible position={position} label={t("app.loading")} />
        </div>
      ))}
    </div>
  ),
};
