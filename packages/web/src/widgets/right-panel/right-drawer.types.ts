import type { ReactNode } from "react";

export interface RightDrawerProps {
  onClose: () => void;
  /** Panel shell title, rendered in the same row as the close button. */
  title?: string;
  /**
   * Optional back control in the shell header for the active layer's internal history.
   * The close button removes the active layer; back only removes its current screen.
   */
  onBack?: () => void;
  /**
   * Cancel aside `px-2` on the content slot so a child list can paint edge-to-edge
   * (row hover). Must be on this direct child — nested `-mx-2` is clipped by
   * `overflow-hidden` wrappers. Other panels keep the shell gutter.
   */
  contentFlush?: boolean;
  children: ReactNode;
}
