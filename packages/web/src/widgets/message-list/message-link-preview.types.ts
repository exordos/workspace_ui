import type {
  LinkPreviewData,
  LinkPreviewCacheStatus,
} from "~/shared/lib/message-link-preview.types";

export interface MessageLinkPreviewProps {
  previewUrl: string;
  previewData: LinkPreviewData | null | undefined;
  status: LinkPreviewCacheStatus;
  /** When true, omits top margin (parent list provides spacing). */
  stacked?: boolean;
}
