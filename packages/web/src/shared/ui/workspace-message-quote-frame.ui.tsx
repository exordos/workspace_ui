import React from "react";
import type {
  WorkspaceMessageQuoteFrameProps,
  WorkspaceMessageQuoteFrameSurface,
} from "./workspace-message-quote-frame.types";

/** Layout + accent bar without fill — fill comes from SURFACE_CLASS_NAME. */
export const WORKSPACE_MESSAGE_QUOTE_FRAME_LAYOUT_CLASS_NAME =
  "my-1 min-w-0 rounded-md border-l-2 border-accent px-2 py-1.5";

const SURFACE_CLASS_NAME: Record<WorkspaceMessageQuoteFrameSurface, string> = {
  message: "bg-bg/35",
  // Composer reply preface only: blend into the composer card, keep the accent bar.
  composer: "bg-composer-outer",
};

/** Default (in-message) chrome: soft fill + accent left bar. */
export const WORKSPACE_MESSAGE_QUOTE_FRAME_CLASS_NAME = `${SURFACE_CLASS_NAME.message} ${WORKSPACE_MESSAGE_QUOTE_FRAME_LAYOUT_CLASS_NAME}`;

const HEADER_BASE_CLASS_NAME =
  "mb-0.5 block max-w-full truncate rounded-sm text-left text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-soft";

/**
 * Presentational quote shell used by WorkspaceMessageQuote and composer reply preface.
 */
export const WorkspaceMessageQuoteFrame = React.memo(function WorkspaceMessageQuoteFrame({
  header,
  headerMuted = false,
  surface = "message",
  children,
  className = "",
  headerProps,
  ...frameProps
}: WorkspaceMessageQuoteFrameProps): React.ReactElement {
  const { className: headerClassName = "", ...restHeaderProps } = headerProps ?? {};

  return (
    <div
      {...frameProps}
      className={`${SURFACE_CLASS_NAME[surface]} ${WORKSPACE_MESSAGE_QUOTE_FRAME_LAYOUT_CLASS_NAME} ${className}`.trim()}
    >
      <span
        {...restHeaderProps}
        className={`${HEADER_BASE_CLASS_NAME} ${
          headerMuted ? "text-text-muted" : "text-accent"
        } ${headerClassName}`.trim()}
      >
        {header}
      </span>
      {children}
    </div>
  );
});

WorkspaceMessageQuoteFrame.displayName = "WorkspaceMessageQuoteFrame";
