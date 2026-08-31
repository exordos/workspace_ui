import { describe, expect, it } from "vitest";
import { normalizeWorkspaceRestEvent } from "./messenger-realtime.api";
import {
  isWorkspaceMessengerEventDto,
  type WorkspaceMessengerEventDto,
  type WorkspaceMessengerExternalOperationEventPayloadDto,
} from "./messenger.types";

const OPERATION_UUID = "10000000-0000-4000-8000-000000000001";
const ACCOUNT_UUID = "20000000-0000-4000-8000-000000000002";
const PROJECT_UUID = "30000000-0000-4000-8000-000000000003";
const USER_UUID = "40000000-0000-4000-8000-000000000004";

function operationSnapshot() {
  return {
    uuid: OPERATION_UUID,
    external_account_uuid: ACCOUNT_UUID,
    action: "message.create",
    status: "succeeded",
  };
}

function externalOperationEvent(
  kind: "external_operation.created" | "external_operation.updated" | "external_operation.deleted",
): WorkspaceMessengerEventDto {
  const action = kind.split(".")[1] as "created" | "updated" | "deleted";
  return {
    schema_version: 1,
    epoch_version: 42,
    uuid: "60000000-0000-4000-8000-000000000006",
    project_id: PROJECT_UUID,
    user_uuid: USER_UUID,
    object_type: "external_operation",
    action,
    payload: {
      kind,
      uuid: OPERATION_UUID,
      snapshot: operationSnapshot(),
    },
    created_at: "2026-07-24T10:01:00Z",
    updated_at: "2026-07-24T10:01:00Z",
  };
}

describe("external operation realtime transport", () => {
  it.each([
    "external_operation.created",
    "external_operation.updated",
    "external_operation.deleted",
  ] as const)("validates and normalizes the full %s snapshot", (kind) => {
    const dto = externalOperationEvent(kind);

    expect(isWorkspaceMessengerEventDto(dto)).toBe(true);
    expect(normalizeWorkspaceRestEvent(dto)).toEqual({
      epoch_version: 42,
      type: "external_operation",
      kind,
      external_operation: operationSnapshot(),
    });
  });

  it("rejects an external operation event whose payload UUID differs from its snapshot", () => {
    const dto = externalOperationEvent("external_operation.updated");
    const payload = dto.payload as WorkspaceMessengerExternalOperationEventPayloadDto;
    dto.payload = {
      ...payload,
      uuid: "70000000-0000-4000-8000-000000000007",
    };

    expect(isWorkspaceMessengerEventDto(dto)).toBe(false);
  });

  it("rejects metadata that does not match the payload kind", () => {
    const dto = externalOperationEvent("external_operation.updated");
    dto.action = "created";

    expect(isWorkspaceMessengerEventDto(dto)).toBe(false);
  });
});
