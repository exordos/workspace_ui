import { normalizeRealm } from "~/shared/api/messenger-realm.internal";
import { workspaceOrgOriginFromLoginServerUrlInput } from "~/shared/lib/workspace-org-origin.lib";

/** IAM credential fields on a saved organization instance. */
export interface IamInstanceTokens {
  authType?: "api_key" | "session" | "iam";
  iamAccessToken?: string;
  iamRefreshToken?: string;
  apiKey: string;
}

/** Fields required to resolve the IAM HTTP API origin for an instance. */
export interface IamOriginSource {
  realm: string;
  workspaceOrgOrigin?: string;
}

/** Workspace Core IAM API origin (`https://org.example.com`) for Bearer-authenticated calls. */
export function resolveIamApiOrigin(source: IamOriginSource): string {
  const stored = source.workspaceOrgOrigin?.trim() ?? "";
  if (stored !== "") {
    return stored;
  }
  const fromLogin = workspaceOrgOriginFromLoginServerUrlInput(source.realm);
  if (fromLogin !== "") {
    return fromLogin;
  }
  try {
    return new URL(normalizeRealm(source.realm)).origin;
  } catch {
    return "";
  }
}

/** Resolves IAM access token, including legacy instances that stored it in `apiKey`. */
export function resolveIamAccessToken(instance: IamInstanceTokens): string {
  if (instance.authType !== "iam") {
    return "";
  }
  const fromField = instance.iamAccessToken?.trim() ?? "";
  if (fromField.length > 0) {
    return fromField;
  }
  return instance.apiKey.trim();
}
