import { t } from "~/i18n/i18n";
import type { useOwnProfileEditor } from "./user-profile-editor.hook";
import type { ProfileEditableField } from "./user-profile-editor.lib";

interface ProfileEditorFieldProps {
  field: ProfileEditableField;
  value: string;
  label: string;
  disabled: boolean;
  onChange: (field: ProfileEditableField, value: string) => void;
}

export function ProfileEditorField({
  field,
  value,
  label,
  disabled,
  onChange,
}: Readonly<ProfileEditorFieldProps>) {
  const inputClass =
    "w-full rounded-lg border border-border-subtle bg-card-bg px-3 text-sm leading-4 text-text-primary focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-60";
  return field === "description" ? (
    <textarea
      name={field}
      aria-label={label}
      value={value}
      disabled={disabled}
      rows={3}
      className={`${inputClass} py-2`}
      onChange={(event) => onChange(field, event.target.value)}
    />
  ) : (
    <input
      name={field}
      aria-label={label}
      type={field === "phone" ? "tel" : "text"}
      value={value}
      disabled={disabled}
      className={`${inputClass} h-8`}
      onChange={(event) => onChange(field, event.target.value)}
    />
  );
}

export function ProfileEditorFeedback({
  editor,
}: Readonly<{ editor: ReturnType<typeof useOwnProfileEditor> }>) {
  const errorMessages = {
    unsupported: t("settings.profileUpdateUnsupported"),
    forbidden: t("settings.profileForbidden"),
    invalid: t("settings.profileInvalidFields"),
    transient: t(
      editor.profile == null ? "settings.profileLoadError" : "settings.profileSaveError",
    ),
  };
  return (
    <>
      {editor.loading && (
        <p role="status" className="px-2 text-sm text-text-secondary">
          {t("settings.profileLoading")}
        </p>
      )}
      {editor.draft != null && !editor.valid && editor.error == null && (
        <p role="alert" className="px-2 text-sm text-text-primary">
          {t("settings.profileInvalidFields")}
        </p>
      )}
      {editor.error != null && (
        <div className="space-y-2 px-2">
          <p role="alert" className="text-sm text-text-primary">
            {errorMessages[editor.error]}
          </p>
          {editor.profile == null && (
            <button type="button" onClick={editor.reload} className="text-sm text-accent">
              {t("settings.profileRetry")}
            </button>
          )}
        </div>
      )}
    </>
  );
}
