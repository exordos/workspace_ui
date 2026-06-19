/** IAM credential fields on a saved organization instance. */
export interface IamInstanceTokens {
  authType?: "api_key" | "session" | "iam";
  iamAccessToken?: string;
  iamRefreshToken?: string;
  apiKey: string;
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
