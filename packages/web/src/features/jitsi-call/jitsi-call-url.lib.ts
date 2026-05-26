export function parseJitsiMeetingUrlLoose(
  meetingUrl: string,
): { domain: string; roomName: string } | null {
  try {
    const parsed = new URL(meetingUrl);
    const domain = parsed.hostname;
    const roomName = parsed.pathname.replace(/^\/+/, "").split("/")[0]?.trim() ?? "";
    if (domain.length === 0 || roomName.length === 0) return null;
    return { domain, roomName };
  } catch {
    return null;
  }
}
