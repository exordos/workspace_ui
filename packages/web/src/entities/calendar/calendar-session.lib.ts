/** Calendar uses the current Workspace IAM token through the shared API client. */
export function getMailboxSessionToken(): string {
  return "workspace-iam";
}
