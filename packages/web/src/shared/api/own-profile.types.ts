import type { WorkspaceApiClientOptions } from "./messenger-transport.internal";

export interface OwnProfile {
  uuid: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  description: string;
}

export type OwnProfilePatch = Partial<
  Pick<OwnProfile, "username" | "firstName" | "lastName" | "phone" | "description">
>;

export interface OwnProfileRequestOptions extends WorkspaceApiClientOptions {
  organizationOrigin: string;
  userUuid: string;
}

// A Workspace adapter can replace IAM without changing the editor contract.
export interface OwnProfileApi {
  load: (options: OwnProfileRequestOptions) => Promise<OwnProfile>;
  update: (options: OwnProfileRequestOptions, patch: OwnProfilePatch) => Promise<OwnProfile>;
}
