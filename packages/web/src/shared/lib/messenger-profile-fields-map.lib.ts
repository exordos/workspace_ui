/**
 * Helpers for optional Workspace custom profile field definitions.
 */

export interface RealmProfileFieldDefinition {
  id: number;
  name: string;
  type: number;
  order: number;
}

const PROFILE_FIELD_SHORT_TEXT = 1;
const PROFILE_FIELD_PARAGRAPH = 2;
const PROFILE_FIELD_PERSON = 6;

function normName(name: string): string {
  return name.trim().toLowerCase();
}

function matchesManagerField(f: RealmProfileFieldDefinition): boolean {
  const n = normName(f.name);
  if (!/(manager|mentor|руковод|наставник|supervisor|reports?\s*to)/u.test(n)) return false;
  return (
    f.type === PROFILE_FIELD_SHORT_TEXT ||
    f.type === PROFILE_FIELD_PARAGRAPH ||
    f.type === PROFILE_FIELD_PERSON
  );
}

/** Whether this field should be treated as manager for profile links. */
export function realmCustomProfileFieldIsManager(f: RealmProfileFieldDefinition): boolean {
  return matchesManagerField(f);
}
