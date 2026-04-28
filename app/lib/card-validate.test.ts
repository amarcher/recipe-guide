import { describe, it, expect } from "vitest";
import { validateCardPayload } from "./card-validate";

const SOURCE = "https://example.com/recipe";

const validCard = {
  title: "Test",
  source_url: SOURCE,
  servings: null,
  total_time: null,
  active_time: null,
  equipment: [],
  pantry_ingredients: [],
  steps: [],
};

describe("validateCardPayload", () => {
  it("accepts a minimal valid card", () => {
    const r = validateCardPayload(validCard, SOURCE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.card.title).toBe("Test");
  });

  it("rejects a missing body", () => {
    expect(validateCardPayload(null, SOURCE)).toEqual({
      ok: false,
      error: "missing card body",
    });
    expect(validateCardPayload(undefined, SOURCE)).toEqual({
      ok: false,
      error: "missing card body",
    });
  });

  it("rejects a non-object body", () => {
    expect(validateCardPayload("a string", SOURCE).ok).toBe(false);
    expect(validateCardPayload(42, SOURCE).ok).toBe(false);
  });

  it("rejects when title is missing or blank", () => {
    expect(validateCardPayload({ ...validCard, title: "" }, SOURCE).ok).toBe(
      false
    );
    expect(validateCardPayload({ ...validCard, title: "   " }, SOURCE).ok).toBe(
      false
    );
    expect(
      validateCardPayload({ ...validCard, title: undefined }, SOURCE).ok
    ).toBe(false);
  });

  it("blocks any attempt to change source_url", () => {
    const r = validateCardPayload(
      { ...validCard, source_url: "https://malicious.example.com/" },
      SOURCE
    );
    expect(r).toEqual({
      ok: false,
      error: "source_url is read-only — fork to change",
    });
  });

  it("rejects when source_url is missing entirely", () => {
    const { source_url: _omitted, ...withoutSource } = validCard;
    void _omitted;
    expect(validateCardPayload(withoutSource, SOURCE).ok).toBe(false);
  });

  it("rejects malformed structural fields", () => {
    expect(
      validateCardPayload({ ...validCard, steps: "not an array" }, SOURCE).ok
    ).toBe(false);
    expect(
      validateCardPayload({ ...validCard, equipment: null }, SOURCE).ok
    ).toBe(false);
    expect(
      validateCardPayload(
        { ...validCard, pantry_ingredients: undefined },
        SOURCE
      ).ok
    ).toBe(false);
  });

  it("preserves the typed card on success", () => {
    const card = {
      ...validCard,
      title: "Pasta",
      steps: [
        {
          number: 1,
          headline: "Boil",
          action: "Boil water.",
          icon: "boil",
          duration: "5 min",
          temperature: null,
          doneness_cue: null,
          equipment: [],
          ingredients: [],
        },
      ],
    };
    const r = validateCardPayload(card, SOURCE);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.card.steps[0].headline).toBe("Boil");
  });
});
