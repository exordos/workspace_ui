import type { ConnectionHealthSnapshot } from "~/shared/lib/connection-health";

export interface LayoutConnectionBannerProps {
  online: boolean;
  health: ConnectionHealthSnapshot;
  rateLimitSeconds: number;
}
