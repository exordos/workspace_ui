export type WorkspaceAccountId = string;
export type WorkspaceOrganizationId = string;
export type WorkspaceProjectId = string;
export type WorkspaceUserUuid = string;
export type WorkspaceInstanceId = string;

// This owner key is the business boundary for one messenger runtime.
export interface WorkspaceRuntimeOwner {
  accountId: WorkspaceAccountId;
  instanceId: WorkspaceInstanceId;
  organizationId: WorkspaceOrganizationId;
  projectId: WorkspaceProjectId;
  userUuid: WorkspaceUserUuid;
}

export interface WorkspaceRuntimeContext extends WorkspaceRuntimeOwner {
  organizationOrigin: string;
  accessToken: string;
  refreshToken?: string;
  runtimeGeneration: number;
}

// Async requests keep this snapshot so stale responses cannot update another project.
export interface WorkspaceRuntimeRequestContext extends WorkspaceRuntimeOwner {
  runtimeGeneration: number;
}
