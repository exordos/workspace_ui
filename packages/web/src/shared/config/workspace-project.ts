/** Canonical IAM project used by every Workspace authentication and client-side data scope. */
export const WORKSPACE_PROJECT_UUID = "fe02e55d-4548-4b3e-a175-fcae928f41b2";

/** IAM scope segment for the canonical Workspace project. */
export const WORKSPACE_IAM_PROJECT_SCOPE = `project:${WORKSPACE_PROJECT_UUID}`;

/** Persisted-session marker bumped whenever Workspace changes its required IAM project scope. */
export const WORKSPACE_IAM_PROJECT_SCOPE_VERSION = 1;
