/**
 * Maps Zulip realm custom profile field definitions to semantic slots (phone, job title, …).
 *
 * Field IDs in `user.profile_data` are org-specific; clients must use GET /realm/profile_fields
 * (`custom_fields[].id` + `name` + `type`) instead of assuming fixed numeric IDs.
 */

export interface RealmProfileFieldDefinition {
  id: number;
  name: string;
  type: number;
  order: number;
}

/** Zulip custom profile field types (see Zulip API /realm/profile_fields). */
const ZULIP_PROFILE_FIELD_SHORT_TEXT = 1;
const ZULIP_PROFILE_FIELD_PARAGRAPH = 2;
const ZULIP_PROFILE_FIELD_DATE = 4;
const ZULIP_PROFILE_FIELD_PERSON = 6;

function extractValue(
  profileData: Readonly<Record<string, { value?: string }>> | undefined,
  fieldId: number | undefined,
): string | undefined {
  if (fieldId == null || profileData == null) return undefined;
  const raw = profileData[String(fieldId)]?.value;
  return raw != null && raw.trim().length > 0 ? raw.trim() : undefined;
}

function normName(name: string): string {
  return name.trim().toLowerCase();
}

/** Phone-like custom fields are almost always short text. */
function matchesPhoneField(f: RealmProfileFieldDefinition): boolean {
  if (f.type !== ZULIP_PROFILE_FIELD_SHORT_TEXT) return false;
  const n = normName(f.name);
  return /(phone|телефон|tel\.|mobile|cell|мобильн|fax|sms)/u.test(n);
}

function matchesManagerField(f: RealmProfileFieldDefinition): boolean {
  const n = normName(f.name);
  if (!/(manager|mentor|руковод|наставник|supervisor|reports?\s*to)/u.test(n)) return false;
  return (
    f.type === ZULIP_PROFILE_FIELD_SHORT_TEXT ||
    f.type === ZULIP_PROFILE_FIELD_PARAGRAPH ||
    f.type === ZULIP_PROFILE_FIELD_PERSON
  );
}

/** Whether this realm field should be treated as “manager” for profile links / semantics. */
export function realmCustomProfileFieldIsManager(f: RealmProfileFieldDefinition): boolean {
  return matchesManagerField(f);
}

function matchesJobTitleField(f: RealmProfileFieldDefinition): boolean {
  const n = normName(f.name);
  if (
    !/(должност|job\s*title|\bposition\b|job\s*role|\btitle\b|\brole\b|роль|team|department|подраздел|команда|специализац)/u.test(
      n,
    )
  ) {
    return false;
  }
  return f.type === ZULIP_PROFILE_FIELD_SHORT_TEXT || f.type === ZULIP_PROFILE_FIELD_PARAGRAPH;
}

function matchesBirthdayField(f: RealmProfileFieldDefinition): boolean {
  if (f.type === ZULIP_PROFILE_FIELD_DATE) return true;
  const n = normName(f.name);
  return /(birthday|birth\s*date|дата\s*рожд|день\s*рожден)/u.test(n);
}

function pickFieldId(
  fields: readonly RealmProfileFieldDefinition[],
  used: Set<number>,
  matcher: (f: RealmProfileFieldDefinition) => boolean,
): number | undefined {
  const sorted = [...fields].sort((a, b) => a.order - b.order);
  for (const f of sorted) {
    if (used.has(f.id)) continue;
    if (matcher(f)) {
      used.add(f.id);
      return f.id;
    }
  }
  return undefined;
}

export interface SemanticProfileCustomFieldValues {
  jobTitle?: string;
  phone?: string;
  manager?: string;
  birthday?: string;
}

/**
 * Reads `profile_data` using realm field definitions. When `fields` is `null`, the request
 * failed — callers may fall back to legacy fixed ids. When `fields` is `[]`, mapping yields empty
 * semantic slots (organization has no custom fields).
 */
export function mapZulipProfileDataToSemanticFields(
  profileData: Readonly<Record<string, { value?: string }>> | undefined,
  fields: readonly RealmProfileFieldDefinition[] | null,
  options?: { useLegacyFixedFieldIds: boolean },
): SemanticProfileCustomFieldValues {
  const out: SemanticProfileCustomFieldValues = {};
  if (profileData == null) return out;

  if (options?.useLegacyFixedFieldIds === true) {
    return {
      jobTitle: extractValue(profileData, 1),
      phone: extractValue(profileData, 2),
      manager: extractValue(profileData, 3),
      birthday: extractValue(profileData, 4),
    };
  }

  if (fields == null || fields.length === 0) {
    return out;
  }

  const used = new Set<number>();
  const birthdayId = pickFieldId(fields, used, matchesBirthdayField);
  const phoneId = pickFieldId(fields, used, matchesPhoneField);
  const managerId = pickFieldId(fields, used, matchesManagerField);
  const jobTitleId = pickFieldId(fields, used, matchesJobTitleField);

  out.birthday = extractValue(profileData, birthdayId);
  out.phone = extractValue(profileData, phoneId);
  out.manager = extractValue(profileData, managerId);
  out.jobTitle = extractValue(profileData, jobTitleId);
  return out;
}
