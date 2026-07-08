import type { WorkspaceMessageBodyMetadata } from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type React from "react";

export interface WorkspaceMessageBodyProps {
  html: string;
  metadata: WorkspaceMessageBodyMetadata;
  useInlineMeta: boolean;
  bodyRef?: React.Ref<HTMLDivElement>;
  onBodyClick?: React.MouseEventHandler<HTMLDivElement>;
}
