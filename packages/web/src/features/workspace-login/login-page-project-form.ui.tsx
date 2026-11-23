import React from "react";
import type { WorkspaceAuthProject } from "~/entities/workspace-auth/workspace-auth.lib";
import { t } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";
import { FormField } from "~/shared/ui/form-field";
import { Select } from "~/shared/ui/select";

interface LoginPageProjectFormProps {
  projects: readonly WorkspaceAuthProject[];
  projectId: string;
  loading: boolean;
  error: string | null;
  onProjectChange: (projectId: string) => void;
  onSubmit: (event: React.SyntheticEvent<HTMLFormElement>) => void;
}

export const LoginPageProjectForm = React.memo<LoginPageProjectFormProps>(
  function LoginPageProjectForm({
    projects,
    projectId,
    loading,
    error,
    onProjectChange,
    onSubmit,
  }) {
    if (projects.length === 0) {
      return (
        <div className="flex flex-col gap-4">
          <div className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base">
            {t("auth.noProjectsAvailable")}
          </div>
          {error != null && error.length > 0 && (
            <div className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base">
              {error}
            </div>
          )}
        </div>
      );
    }

    return (
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <FormField label={t("auth.selectProject")} htmlFor="projectId">
          <Select
            id="projectId"
            value={projectId}
            onValueChange={onProjectChange}
            disabled={loading}
            placeholder={t("auth.selectProjectPlaceholder")}
            options={projects.map((project) => ({
              value: project.id,
              label:
                project.organizationName != null
                  ? `${project.name} — ${project.organizationName}`
                  : project.name,
            }))}
          />
        </FormField>

        {error != null && error.length > 0 && (
          <div className="border-notice-base/20 bg-notice-base/10 rounded-lg border px-3 py-2 text-sm text-notice-base">
            {error}
          </div>
        )}

        <Button type="submit" disabled={loading || projectId.length === 0} className="w-full">
          {loading ? t("auth.loginLoading") : t("auth.login")}
        </Button>
      </form>
    );
  },
);
