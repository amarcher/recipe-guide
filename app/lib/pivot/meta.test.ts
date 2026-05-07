import { describe, expect, it } from "vitest";
import { slimPivotMetaForClient } from "./meta";

describe("slimPivotMetaForClient", () => {
  it("strips revisedCard and keeps the badge-relevant fields", () => {
    const slim = slimPivotMetaForClient({
      problemText: "I added too much tomato paste",
      aiNotes: "Stir in cream off-heat to round out the acid.",
      changes: ["Added: ½ cup heavy cream", "Simmer 8-10 → 6-8 min"],
      revisedCard: {
        title: "Sunday Pomodoro",
        steps: [],
        // …a lot of fields the client doesn't need on the list endpoint
      },
      createdAt: 1715000000000,
    });
    expect(slim).toEqual({
      problemText: "I added too much tomato paste",
      aiNotes: "Stir in cream off-heat to round out the acid.",
      changes: ["Added: ½ cup heavy cream", "Simmer 8-10 → 6-8 min"],
      createdAt: 1715000000000,
    });
    expect(slim).not.toHaveProperty("revisedCard");
  });

  it("returns null for non-objects", () => {
    expect(slimPivotMetaForClient(null)).toBeNull();
    expect(slimPivotMetaForClient(undefined)).toBeNull();
    expect(slimPivotMetaForClient("string")).toBeNull();
    expect(slimPivotMetaForClient(42)).toBeNull();
  });

  it("returns null when problemText is missing", () => {
    // problemText is the only mandatory field — without it there's no
    // user-attributable signal to display, so refuse to render the badge.
    expect(slimPivotMetaForClient({ aiNotes: "yo", changes: [], createdAt: 0 })).toBeNull();
  });

  it("coerces malformed optional fields to safe defaults", () => {
    const slim = slimPivotMetaForClient({
      problemText: "burnt the onions",
      // aiNotes wrong type → empty string
      aiNotes: 42,
      // changes contains non-string → filter to strings
      changes: ["good", 999, null, "also good"],
      // createdAt missing → 0
    });
    expect(slim).toEqual({
      problemText: "burnt the onions",
      aiNotes: "",
      changes: ["good", "also good"],
      createdAt: 0,
    });
  });
});
