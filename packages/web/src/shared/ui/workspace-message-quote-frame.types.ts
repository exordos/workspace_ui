import type { HTMLAttributes, ReactNode } from "react";

type DataAttrProps = Record<`data-${string}`, string | undefined>;

/** Default soft fill in messages; composer matches the composer outer surface. */
export type WorkspaceMessageQuoteFrameSurface = "message" | "composer";

export interface WorkspaceMessageQuoteFrameProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children"
> {
  /** Author / status line shown above the quoted body. */
  header: ReactNode;
  /** Soft muted header (e.g. unavailable quote). */
  headerMuted?: boolean;
  /**
   * Background fill only — left accent bar and padding stay the same.
   * `composer` is a reply-preface exception so the quote blends into the composer card.
   */
  surface?: WorkspaceMessageQuoteFrameSurface;
  children?: ReactNode;
  /** Extra props for the header `<span>` (open-quote marker attrs, etc.). */
  headerProps?: HTMLAttributes<HTMLSpanElement> & DataAttrProps;
}
