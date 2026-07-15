export interface WorkspaceEventPayload extends Record<string, unknown> {
  kind: string;
}

export type WorkspaceEventObjectType =
  | "message"
  | "message_reaction"
  | "stream"
  | "stream_binding"
  | "topic"
  | "user"
  | "folder"
  | "folder_item"
  | "external_account"
  | "mail_folder"
  | "mail_message"
  | "calendar"
  | "calendar_event";

/** Canonical event returned by both GET /events/ and /events/ws. */
export interface WorkspaceEvent {
  schema_version: number;
  uuid: string;
  epoch_version: number;
  project_id: string;
  user_uuid: string;
  object_type: WorkspaceEventObjectType;
  action: string;
  created_at: string;
  updated_at: string;
  payload: WorkspaceEventPayload;
}
