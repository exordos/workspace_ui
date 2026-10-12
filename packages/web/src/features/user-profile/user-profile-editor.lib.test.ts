import { describe, expect, it } from "vitest";
import type { OwnProfile } from "~/shared/api/own-profile.types";
import {
  isProfileDraftValid,
  isProfileUsernameValid,
  profileDraft,
  profileDraftDisplayName,
  profilePatch,
} from "./user-profile-editor.lib";

const profile: OwnProfile = {
  uuid: "user",
  username: "alice",
  firstName: "Alice",
  lastName: "Smith",
  email: "alice@example.com",
  phone: null,
  description: "",
};
describe("profile draft", () => {
  it("keeps username independent of name parts and only writes changed fields", () => {
    const baseline = profileDraft(profile);
    const draft = { ...baseline, username: "new-alice", firstName: "", lastName: "" };
    expect(profilePatch(baseline, draft)).toEqual({
      username: "new-alice",
      firstName: null,
      lastName: null,
    });
    expect(profileDraftDisplayName(draft)).toBe("new-alice");
    expect(profileDraftDisplayName(baseline)).toBe("Alice Smith");
  });
  it.each([
    ["", "", "alice"],
    [" Alice ", "", "Alice"],
    ["", " Smith ", "Smith"],
    [" Alice ", " Smith ", "Alice Smith"],
    [" ", " ", "alice"],
  ])("previews optional names (%s, %s) as %s", (firstName, lastName, expected) => {
    const draft = { ...profileDraft(profile), firstName, lastName };
    expect(profileDraftDisplayName(draft)).toBe(expected);
    expect(isProfileDraftValid(draft)).toBe(true);
  });

  it("uses the current username after clearing both names and normalizes only saved fields", () => {
    const baseline = profileDraft(profile);
    const draft = {
      ...baseline,
      username: " new-alice ",
      firstName: " ",
      lastName: " ",
      phone: " +123 ",
      description: " About me ",
    };
    expect(profileDraftDisplayName(draft)).toBe("new-alice");
    expect(profilePatch(baseline, draft)).toEqual({
      username: "new-alice",
      firstName: null,
      lastName: null,
      phone: "+123",
      description: " About me ",
    });
    expect(profilePatch(baseline, { ...baseline, username: " alice " })).toEqual({});
  });

  it.each([
    ["a", true],
    ["  alice  ", true],
    ["Иван_01", true],
    ["Élodie", true],
    ["名字", true],
    ["alice smith", true],
    ["Ⅰ²", true],
    ["𐐀".repeat(128), true],
    ["𐐀".repeat(129), false],
    ["a".repeat(128), true],
    ["a".repeat(129), false],
    ["", false],
    ["   ", false],
    ["bad@username", false],
    ["a😀", false],
    ["e\u0301", false],
    ["a\tb", false],
    ["a\nb", false],
    ["a\u0000b", false],
    ["a\u00a0b", false],
  ])("matches IAM username validation for %j", (username, expected) => {
    expect(isProfileUsernameValid(username)).toBe(expected);
    expect(isProfileDraftValid({ ...profileDraft(profile), username })).toBe(expected);
  });

  it("accepts the punctuation allowed by IAM", () => {
    expect(isProfileUsernameValid("a!#$%& '*+/=?^_`{|}~.-")).toBe(true);
    for (const punctuation of ["@", ":", ";", "(", ")", "[", "]", ",", "<", ">", "\\", '"']) {
      expect(isProfileUsernameValid(`a${punctuation}`)).toBe(false);
    }
  });

  it.each([
    ["", true],
    ["😀".repeat(128), true],
    ["😀".repeat(129), false],
    ["Alice\nSmith", false],
    ["Alice\rSmith", true],
    ["Alice\u2028Smith", true],
  ])("matches optional IAM name validation for %j", (name, expected) => {
    const draft = profileDraft(profile);
    expect(isProfileDraftValid({ ...draft, firstName: name })).toBe(expected);
    expect(isProfileDraftValid({ ...draft, lastName: name })).toBe(expected);
  });

  it("validates required username and supported field lengths", () => {
    const draft = profileDraft(profile);
    expect(isProfileDraftValid(draft)).toBe(true);
    expect(isProfileDraftValid({ ...draft, username: "" })).toBe(false);
    expect(isProfileDraftValid({ ...draft, username: "bad@username" })).toBe(false);
    expect(isProfileDraftValid({ ...draft, firstName: "A".repeat(129) })).toBe(false);
    expect(isProfileDraftValid({ ...draft, phone: "1".repeat(16) })).toBe(false);
  });
});
