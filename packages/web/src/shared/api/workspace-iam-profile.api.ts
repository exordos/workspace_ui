import { messengerRequestJsonResult } from "./messenger-transport.internal";
import type { OwnProfile, OwnProfileApi, OwnProfileRequestOptions } from "./own-profile.types";

function nullableString(value: unknown, field: string): string | null {
  if (value == null) return null;
  if (typeof value !== "string") throw new TypeError(`Invalid IAM profile ${field}`);
  return value;
}

export function parseWorkspaceIamProfile(value: unknown, userUuid: string): OwnProfile {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Invalid IAM profile response");
  }
  const dto = value as Record<string, unknown>;
  if (dto.uuid !== userUuid || typeof dto.username !== "string" || !dto.username.trim()) {
    throw new TypeError("Invalid IAM profile identity");
  }
  return {
    uuid: userUuid,
    username: dto.username,
    firstName: nullableString(dto.first_name, "first_name"),
    lastName: nullableString(dto.last_name, "last_name"),
    email: nullableString(dto.email, "email"),
    phone: nullableString(dto.phone, "phone"),
    description: nullableString(dto.description, "description") ?? "",
  };
}

function requestOptions(options: OwnProfileRequestOptions): OwnProfileRequestOptions {
  return {
    ...options,
    baseUrl: `${options.organizationOrigin.replace(/\/+$/, "")}/api/core/v1/iam`,
  };
}

export const workspaceIamProfileApi: OwnProfileApi = {
  async load(options) {
    const { data } = await messengerRequestJsonResult(
      "GET",
      `/users/${encodeURIComponent(options.userUuid)}`,
      requestOptions(options),
    );
    return parseWorkspaceIamProfile(data, options.userUuid);
  },
  async update(options, patch) {
    const { data } = await messengerRequestJsonResult(
      "PUT",
      `/users/${encodeURIComponent(options.userUuid)}`,
      requestOptions(options),
      {},
      {
        ...(patch.username === undefined ? {} : { username: patch.username }),
        ...(patch.firstName === undefined ? {} : { first_name: patch.firstName }),
        ...(patch.lastName === undefined ? {} : { last_name: patch.lastName }),
        ...(patch.phone === undefined ? {} : { phone: patch.phone }),
        ...(patch.description === undefined ? {} : { description: patch.description }),
      },
    );
    return parseWorkspaceIamProfile(data, options.userUuid);
  },
};
