import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessengerTopic } from "~/entities/messenger/messenger.types";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type { WorkspaceTopicSummaryEndpointDto } from "~/shared/api/messenger-topic-summary-management.types";
import { TopicSummarySettingsDialog } from "./topic-summary-settings-dialog.ui";
import type { UseTopicSummaryEndpointsResult } from "./topic-summary-endpoints.hook";
import type { UseTopicSummarySettingsResult } from "./topic-summary-settings.hook";
import type { TopicSummaryPermission } from "./topic-summary-settings.types";

const mocks = vi.hoisted(() => ({
  useSettings: vi.fn(),
  useEndpoints: vi.fn(),
}));

vi.mock("./topic-summary-settings.hook", async (importOriginal) => ({
  ...(await importOriginal()),
  useTopicSummarySettings: mocks.useSettings,
}));

vi.mock("./topic-summary-endpoints.hook", async (importOriginal) => ({
  ...(await importOriginal()),
  useTopicSummaryEndpoints: mocks.useEndpoints,
}));

const PROJECT_UUID = "00000000-0000-4000-8000-000000000001";

function runtime(): WorkspaceRuntimeContext {
  return {
    accountId: "account-1",
    instanceId: "instance-1",
    organizationId: "organization-1",
    projectId: PROJECT_UUID,
    userUuid: "00000000-0000-4000-8000-000000000003",
    organizationOrigin: "https://workspace.example.com",
    accessToken: "token",
    runtimeGeneration: 1,
  };
}

function topic(): MessengerTopic {
  return {
    uuid: "00000000-0000-4000-8000-000000000010",
    projectId: PROJECT_UUID,
    streamUuid: "00000000-0000-4000-8000-000000000002",
    userUuid: "00000000-0000-4000-8000-000000000003",
    name: "Roadmap",
    unreadCount: 0,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    lastMessageUuid: null,
    summaryEnabled: true,
    summarySystemPrompt: "Focus on decisions",
    summaryReasoningEffort: "medium",
    createdAt: "2026-08-21T10:00:00Z",
    updatedAt: "2026-08-21T10:00:00Z",
  };
}

function settingsVm(): UseTopicSummarySettingsResult {
  return {
    topic: {
      base: {
        summaryEnabled: true,
        summarySystemPrompt: null,
        summaryReasoningEffort: null,
      },
      draft: {
        summaryEnabled: true,
        summarySystemPrompt: "Focus on decisions",
        summaryReasoningEffort: "medium",
      },
      dirtyFields: ["summary_system_prompt", "summary_reasoning_effort"],
      status: "idle",
      error: null,
      validationError: null,
      permission: "allowed",
    },
    gates: {
      server: {
        project_id: PROJECT_UUID,
        global_enabled: true,
        project_enabled: true,
      },
      draft: { globalEnabled: true, projectEnabled: false },
      dirty: true,
      loadStatus: "ready",
      saveStatus: "idle",
      error: null,
      permission: "unknown",
    },
    setTopicEnabled: vi.fn(),
    setTopicSystemPrompt: vi.fn(),
    setTopicReasoningEffort: vi.fn(),
    resetTopicDraft: vi.fn(),
    saveTopic: vi.fn(),
    setGlobalEnabled: vi.fn(),
    setProjectEnabled: vi.fn(),
    resetGatesDraft: vi.fn(),
    loadGates: vi.fn(),
    saveGates: vi.fn(),
  };
}

function endpoint(): WorkspaceTopicSummaryEndpointDto {
  return {
    uuid: "00000000-0000-4000-8000-000000000020",
    name: "Primary",
    base_url: "https://llm.example.com/v1",
    model: "summary-model",
    enabled: true,
    priority: 10,
    supports_vision: true,
    supports_reasoning: true,
    temperature: 0.2,
    max_output_tokens: 512,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    credential_present: true,
    claim_expires_at: null,
    last_success_at: null,
    last_failure_at: null,
    failure_count: 0,
    last_error_code: null,
    created_at: "2026-08-21T10:00:00Z",
    updated_at: "2026-08-21T10:00:00Z",
  };
}

function endpointsVm(
  overrides: Partial<UseTopicSummaryEndpointsResult> = {},
): UseTopicSummaryEndpointsResult {
  return {
    permission: "allowed",
    endpoints: [endpoint()],
    loadStatus: "ready",
    loadError: null,
    create: { draft: null, validationErrors: {}, status: "idle", error: null },
    edit: {
      endpointUuid: null,
      base: null,
      draft: null,
      validationErrors: {},
      status: "idle",
      error: null,
    },
    remove: { endpointUuid: null, status: "idle", error: null },
    reload: vi.fn(),
    startCreate: vi.fn(),
    setCreateField: vi.fn(),
    cancelCreate: vi.fn(),
    createEndpoint: vi.fn(),
    startEdit: vi.fn(),
    setEditField: vi.fn(),
    cancelEdit: vi.fn(),
    updateEndpoint: vi.fn(),
    deleteEndpoint: vi.fn(),
    ...overrides,
  };
}

interface DialogPermissions {
  topicPermission: TopicSummaryPermission;
  gatesPermission: TopicSummaryPermission;
  endpointsPermission: TopicSummaryPermission;
}

function renderDialog(
  permissions: DialogPermissions = {
    topicPermission: "allowed",
    gatesPermission: "allowed",
    endpointsPermission: "allowed",
  },
) {
  return render(
    <TopicSummarySettingsDialog
      open
      onOpenChange={vi.fn()}
      runtimeContext={runtime()}
      topic={topic()}
      {...permissions}
    />,
  );
}

describe("TopicSummarySettingsDialog", () => {
  beforeEach(() => {
    mocks.useSettings.mockReset();
    mocks.useEndpoints.mockReset();
    mocks.useSettings.mockReturnValue(settingsVm());
    mocks.useEndpoints.mockReturnValue(endpointsVm());
  });

  it("discovers common permissions from unknown without exposing the topic section", () => {
    renderDialog({
      topicPermission: "denied",
      gatesPermission: "unknown",
      endpointsPermission: "unknown",
    });

    expect(screen.queryByText("This topic")).not.toBeInTheDocument();
    expect(screen.getByText("Common settings")).toBeInTheDocument();
    expect(screen.getByText("LLM endpoints")).toBeInTheDocument();
    expect(mocks.useSettings).toHaveBeenCalledWith(
      expect.objectContaining({ loadGatesOnOpen: true, open: true }),
    );
    expect(mocks.useEndpoints).toHaveBeenCalledWith(
      expect.objectContaining({ open: true, permission: "unknown" }),
    );
  });

  it("wires the topic prompt, reset, reasoning and save controls", () => {
    const vm = settingsVm();
    mocks.useSettings.mockReturnValue(vm);
    renderDialog({
      topicPermission: "allowed",
      gatesPermission: "denied",
      endpointsPermission: "denied",
    });

    fireEvent.change(screen.getByLabelText(/^System prompt/), {
      target: { value: "Only decisions" },
    });
    expect(vm.setTopicSystemPrompt).toHaveBeenCalledWith("Only decisions");
    fireEvent.click(screen.getByRole("button", { name: "Use default prompt" }));
    expect(vm.setTopicSystemPrompt).toHaveBeenCalledWith(null);
    fireEvent.change(screen.getByLabelText("Reasoning effort"), {
      target: { value: "high" },
    });
    expect(vm.setTopicReasoningEffort).toHaveBeenCalledWith("high");
    fireEvent.click(screen.getByRole("button", { name: "Save topic settings" }));
    expect(vm.saveTopic).toHaveBeenCalledOnce();
  });

  it("wires project gates and their independent save", () => {
    const vm = settingsVm();
    mocks.useSettings.mockReturnValue(vm);
    renderDialog({
      topicPermission: "denied",
      gatesPermission: "allowed",
      endpointsPermission: "denied",
    });

    fireEvent.click(screen.getByLabelText("Enabled for this project"));
    expect(vm.setProjectEnabled).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Save common settings" }));
    expect(vm.saveGates).toHaveBeenCalledOnce();
  });

  it("supports endpoint add, edit, and confirmed delete actions", () => {
    const vm = endpointsVm();
    mocks.useEndpoints.mockReturnValue(vm);
    renderDialog({
      topicPermission: "denied",
      gatesPermission: "denied",
      endpointsPermission: "allowed",
    });

    fireEvent.click(screen.getByRole("button", { name: "Add endpoint" }));
    expect(vm.startCreate).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(vm.startEdit).toHaveBeenCalledWith(endpoint().uuid);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const confirmation = screen.getByRole("alertdialog");
    expect(within(confirmation).getByText(/Delete endpoint “Primary”/)).toBeInTheDocument();
    fireEvent.click(within(confirmation).getByRole("button", { name: "Delete" }));
    expect(vm.deleteEndpoint).toHaveBeenCalledWith(endpoint().uuid);
  });

  it("renders the write-only API key editor and submits create", () => {
    const vm = endpointsVm({
      endpoints: [],
      create: {
        draft: {
          uuid: endpoint().uuid,
          name: "",
          baseUrl: "",
          model: "",
          apiKey: "",
          enabled: true,
          priority: 10,
          supportsVision: false,
          supportsReasoning: false,
          temperature: 0.2,
          maxOutputTokens: 512,
          topP: 1,
          presencePenalty: 0,
          frequencyPenalty: 0,
        },
        validationErrors: {},
        status: "idle",
        error: null,
      },
    });
    mocks.useEndpoints.mockReturnValue(vm);
    renderDialog({
      topicPermission: "denied",
      gatesPermission: "denied",
      endpointsPermission: "allowed",
    });

    const apiKey = screen.getByLabelText(/^API key/);
    expect(apiKey).toHaveAttribute("type", "password");
    expect(apiKey).toHaveAttribute("autocomplete", "new-password");
    fireEvent.change(apiKey, { target: { value: "secret" } });
    expect(vm.setCreateField).toHaveBeenCalledWith("apiKey", "secret");
    fireEvent.click(screen.getByRole("button", { name: "Create endpoint" }));
    expect(vm.createEndpoint).toHaveBeenCalledOnce();
  });

  it("turns every section read-only after server permission denial", () => {
    const settings = settingsVm();
    settings.topic.permission = "denied";
    settings.gates.permission = "denied";
    mocks.useSettings.mockReturnValue(settings);
    mocks.useEndpoints.mockReturnValue(
      endpointsVm({
        permission: "denied",
        endpoints: [],
        loadStatus: "error",
        loadError: "forbidden",
      }),
    );

    renderDialog();

    expect(
      screen.getAllByText("You do not have permission to change these settings."),
    ).toHaveLength(3);
    expect(screen.getByLabelText("Update the summary automatically")).toBeDisabled();
    expect(screen.getByLabelText("Enabled for this project")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add endpoint" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("does not mount a modal when every section is denied", () => {
    renderDialog({
      topicPermission: "denied",
      gatesPermission: "denied",
      endpointsPermission: "denied",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
