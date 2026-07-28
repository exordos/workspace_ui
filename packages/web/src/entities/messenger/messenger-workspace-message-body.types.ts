import type {
  WorkspaceMessageBodyMetadata,
  WorkspaceMessageBodyQuoteSegment,
  WorkspaceMessageBodySegment,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import type React from "react";

export interface WorkspaceMessageBodyProps {
  html: string;
  segments?: readonly WorkspaceMessageBodySegment[];
  renderQuote?: (segment: WorkspaceMessageBodyQuoteSegment, index: number) => React.ReactNode;
  metadata: WorkspaceMessageBodyMetadata;
  useInlineMeta: boolean;
  bodyRef?: React.Ref<HTMLDivElement>;
  onBodyClick?: React.MouseEventHandler<HTMLDivElement>;
}
