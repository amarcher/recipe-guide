import { describe, it, expect } from "vitest";
import { overrideScopeFor } from "./card-scope";

describe("overrideScopeFor", () => {
  it("routes a personal-scope save to its saver's userId", () => {
    expect(overrideScopeFor({ userId: "user_a", familyId: null })).toEqual({
      userId: "user_a",
      familyId: null,
    });
  });

  it("routes a family-scope save to its familyId, regardless of saver", () => {
    expect(
      overrideScopeFor({ userId: "user_a", familyId: "family_x" })
    ).toEqual({ userId: null, familyId: "family_x" });
    expect(
      overrideScopeFor({ userId: "user_b", familyId: "family_x" })
    ).toEqual({ userId: null, familyId: "family_x" });
  });

  it("never returns both userId and familyId set — they are mutually exclusive", () => {
    const personal = overrideScopeFor({ userId: "u", familyId: null });
    const family = overrideScopeFor({ userId: "u", familyId: "f" });
    expect(personal.userId === null || personal.familyId === null).toBe(true);
    expect(family.userId === null || family.familyId === null).toBe(true);
  });
});
