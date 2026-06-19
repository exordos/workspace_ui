import { describe, expect, it } from "vitest";
import {
  mapMessengerProfileDataToSemanticFields,
  type RealmProfileFieldDefinition,
} from "~/shared/lib/messenger-profile-fields-map.lib";

const baseFields = (defs: RealmProfileFieldDefinition[]): RealmProfileFieldDefinition[] =>
  [...defs].sort((a, b) => a.order - b.order);

describe("mapMessengerProfileDataToSemanticFields", () => {
  it("uses legacy ids when useLegacyFixedFieldIds is true", () => {
    const profile = {
      "1": { value: "Engineer" },
      "2": { value: "+1" },
      "3": { value: "Boss" },
      "4": { value: "2000-01-01" },
    };
    expect(
      mapMessengerProfileDataToSemanticFields(profile, null, { useLegacyFixedFieldIds: true }),
    ).toEqual({
      jobTitle: "Engineer",
      phone: "+1",
      manager: "Boss",
      birthday: "2000-01-01",
    });
  });

  it("returns empty semantic slots when definitions are loaded but empty", () => {
    expect(
      mapMessengerProfileDataToSemanticFields({ "1": { value: "x" } }, [], {
        useLegacyFixedFieldIds: false,
      }),
    ).toEqual({});
  });

  it("maps org-specific ids by field name (RU team / manager vs phone)", () => {
    const fields = baseFields([
      { id: 1, name: "Команда / роль", type: 1, order: 1 },
      { id: 2, name: "Руководитель", type: 1, order: 2 },
      { id: 3, name: "Телефон", type: 1, order: 3 },
    ]);
    const profile = {
      "1": { value: "E-com > AQA Lead" },
      "2": { value: "Руководитель: vys" },
      "3": { value: "+7 999 000-00-00" },
    };
    expect(mapMessengerProfileDataToSemanticFields(profile, fields)).toEqual({
      jobTitle: "E-com > AQA Lead",
      manager: "Руководитель: vys",
      phone: "+7 999 000-00-00",
    });
  });

  it("prefers date-picker type for birthday", () => {
    const fields = baseFields([
      { id: 10, name: "Anything", type: 4, order: 1 },
      { id: 11, name: "Phone", type: 1, order: 2 },
    ]);
    const profile = {
      "10": { value: "1990-05-01" },
      "11": { value: "+1" },
    };
    expect(mapMessengerProfileDataToSemanticFields(profile, fields).birthday).toBe("1990-05-01");
    expect(mapMessengerProfileDataToSemanticFields(profile, fields).phone).toBe("+1");
  });

  it("does not assign paragraph biography to phone", () => {
    const fields = baseFields([
      { id: 1, name: "Biography", type: 2, order: 1 },
      { id: 2, name: "Mobile", type: 1, order: 2 },
    ]);
    const profile = {
      "1": { value: "Long text..." },
      "2": { value: "+99" },
    };
    const r = mapMessengerProfileDataToSemanticFields(profile, fields);
    expect(r.phone).toBe("+99");
    expect(r.jobTitle).toBeUndefined();
  });
});
