export function resolveLinkPreviewHideReason(
  status: string,
  previewData: unknown,
): "unavailable" | "no-data-non-loading" | null {
  if (status === "unavailable") {
    return "unavailable";
  }
  if (status !== "loading" && previewData == null) {
    return "no-data-non-loading";
  }
  return null;
}
