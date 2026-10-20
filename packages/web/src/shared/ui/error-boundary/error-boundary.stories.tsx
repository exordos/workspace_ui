import { fn } from "storybook/test";
import { t } from "~/i18n/i18n";
import { ErrorBoundary, PageErrorFallback, PageLoader } from "./error-boundary";
import { SectionErrorFallback, WidgetErrorBoundary } from "./widget-error-boundary.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Shared/Feedback/ErrorBoundary",
  component: ErrorBoundary,
  args: { children: null },
  render: () => (
    <ErrorBoundary>
      <p>{t("settings.statusDialogHint")}</p>
    </ErrorBoundary>
  ),
  parameters: {
    docs: {
      description: {
        component:
          "Healthy boundaries and exported fallback presentation. Error capture and recovery are covered by the module tests; these examples do not throw or send telemetry.",
      },
    },
  },
} satisfies Meta<typeof ErrorBoundary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WidgetHealthy: Story = {
  render: () => (
    <WidgetErrorBoundary sectionLabel={t("settings.appearance")}>
      <p>{t("settings.statusDialogHint")}</p>
    </WidgetErrorBoundary>
  ),
};
export const PageFallback: Story = { render: () => <PageErrorFallback onRetry={fn()} /> };
export const SectionFallback: Story = {
  render: () => <SectionErrorFallback onRetry={fn()} label={t("settings.appearance")} />,
};
export const SectionWithoutRetry: Story = { render: () => <SectionErrorFallback /> };
export const LoadingPage: Story = {
  render: () => <PageLoader />,
  parameters: { layout: "fullscreen" },
};
