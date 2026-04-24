import { describe, it, expect } from "vitest";
import { parseQty, formatQty, scaleQty, scaleServings } from "./scale";

describe("parseQty", () => {
  it("parses a plain integer", () => {
    expect(parseQty("2")).toBe(2);
  });

  it("parses a decimal", () => {
    expect(parseQty("1.5")).toBe(1.5);
  });

  it("parses a vulgar fraction alone", () => {
    expect(parseQty("½")).toBe(0.5);
    expect(parseQty("¼")).toBe(0.25);
    expect(parseQty("⅛")).toBe(0.125);
  });

  it("parses a mixed number written as 1 1/2", () => {
    expect(parseQty("1 1/2")).toBe(1.5);
    expect(parseQty("2 3/4")).toBe(2.75);
  });

  it("parses a mixed number written with a vulgar fraction", () => {
    expect(parseQty("1 ½")).toBe(1.5);
    expect(parseQty("3 ¼")).toBe(3.25);
  });

  it("parses a simple fraction", () => {
    expect(parseQty("3/4")).toBe(0.75);
  });

  it("returns null for empty / whitespace / non-numeric input", () => {
    expect(parseQty("")).toBeNull();
    expect(parseQty("   ")).toBeNull();
    expect(parseQty("to taste")).toBeNull();
  });

  it("ignores trailing units when reading the leading number", () => {
    expect(parseQty("2 cups")).toBe(2);
    expect(parseQty("1.5 tbsp")).toBe(1.5);
  });
});

describe("formatQty", () => {
  it("formats integers without a fraction", () => {
    expect(formatQty(0)).toBe("0");
    expect(formatQty(1)).toBe("1");
    expect(formatQty(7)).toBe("7");
  });

  it("formats common fractions as vulgar glyphs", () => {
    expect(formatQty(0.5)).toBe("½");
    expect(formatQty(0.25)).toBe("¼");
    expect(formatQty(0.75)).toBe("¾");
  });

  it("formats mixed numbers with vulgar glyphs", () => {
    expect(formatQty(1.5)).toBe("1 ½");
    expect(formatQty(2.25)).toBe("2 ¼");
  });

  it("rounds to nearest vulgar within tolerance", () => {
    // 1/3 ≈ 0.333; close enough to ⅓ (within TOL=0.03).
    expect(formatQty(1 / 3)).toBe("⅓");
    expect(formatQty(2 / 3)).toBe("⅔");
  });

  it("collapses values near a whole number", () => {
    expect(formatQty(1.001)).toBe("1");
    expect(formatQty(1.99)).toBe("2");
  });

  it("falls back to a trimmed decimal when no fraction is close", () => {
    // 1.42 sits between ⅜ (0.375) and ½ (0.5), outside the 0.03 tolerance.
    expect(formatQty(1.42)).toBe("1.42");
  });

  it("preserves the sign for negatives", () => {
    expect(formatQty(-1.5)).toBe("-1 ½");
  });
});

describe("scaleQty", () => {
  it("returns null when input is null", () => {
    expect(scaleQty(null, 2)).toBeNull();
  });

  it("returns the original string when factor is 1", () => {
    expect(scaleQty("1 ½", 1)).toBe("1 ½");
  });

  it("scales a bare integer", () => {
    expect(scaleQty("2", 3)).toBe("6");
  });

  it("scales a quantity with a unit tail", () => {
    expect(scaleQty("1 cup", 2)).toBe("2 cup");
    expect(scaleQty("½ tsp", 4)).toBe("2 tsp");
  });

  it("scales a hyphen range", () => {
    expect(scaleQty("8-10", 2)).toBe("16–20");
  });

  it("scales an en-dash range", () => {
    expect(scaleQty("8–10", 0.5)).toBe("4–5");
  });

  it("returns the original string when the leading number cannot be parsed", () => {
    expect(scaleQty("a pinch", 2)).toBe("a pinch");
  });
});

describe("scaleServings", () => {
  it("returns null/passes through when factor is 1", () => {
    expect(scaleServings(null, 2)).toBeNull();
    expect(scaleServings("4", 1)).toBe("4");
  });

  it("scales a single number", () => {
    expect(scaleServings("4 servings", 2)).toBe("8 servings");
  });

  it("scales a range", () => {
    expect(scaleServings("4-6", 2)).toBe("8–12");
  });
});
