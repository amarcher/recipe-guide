import { describe, it, expect } from "vitest";
import { parseMinutesRange, formatClock, formatMinutes } from "./duration";

describe("parseMinutesRange", () => {
  it("returns null for null / empty / non-matching input", () => {
    expect(parseMinutesRange(null)).toBeNull();
    expect(parseMinutesRange("")).toBeNull();
    expect(parseMinutesRange("a few moments")).toBeNull();
  });

  it("parses a single duration in each unit", () => {
    expect(parseMinutesRange("30 minutes")).toEqual({ low: 30, high: 30 });
    expect(parseMinutesRange("30 min")).toEqual({ low: 30, high: 30 });
    expect(parseMinutesRange("1 hour")).toEqual({ low: 60, high: 60 });
    expect(parseMinutesRange("2 hrs")).toEqual({ low: 120, high: 120 });
    expect(parseMinutesRange("30 sec")).toEqual({ low: 0.5, high: 0.5 });
  });

  it("sums compound durations", () => {
    expect(parseMinutesRange("1 hour 30 minutes")).toEqual({ low: 90, high: 90 });
    expect(parseMinutesRange("2h 15m")).toEqual({ low: 135, high: 135 });
  });

  it("parses an inline range with 'to'", () => {
    // Both numbers share the unit and are matched as a single token.
    expect(parseMinutesRange("30 to 60 minutes")).toEqual({ low: 30, high: 60 });
  });

  it("parses an inline range with a hyphen", () => {
    expect(parseMinutesRange("8-10 minutes")).toEqual({ low: 8, high: 10 });
    expect(parseMinutesRange("1-2 hours")).toEqual({ low: 60, high: 120 });
  });

  it("parses a multi-token range across units", () => {
    expect(parseMinutesRange("30 minutes to 1 hour")).toEqual({ low: 30, high: 60 });
  });

  it("documents current behavior on mixed compound + range (known limitation)", () => {
    // Ideal: low = 1h30m = 90, high = 2h = 120.
    // Current: range mode triggers on the trailing " to ", so only the first
    // token's low and the last token's high are used; the middle "30 minutes"
    // is dropped. Test pinned to current behavior so a fix is intentional.
    expect(parseMinutesRange("1 hour and 30 minutes to 2 hours")).toEqual({
      low: 60,
      high: 120,
    });
  });

  it.todo("correctly handles mixed compound + range (90–120)");
});

describe("formatClock", () => {
  it("formats whole minutes with zero seconds padded", () => {
    expect(formatClock(60)).toBe("1:00");
    expect(formatClock(120)).toBe("2:00");
  });

  it("formats odd seconds with two-digit padding", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(599)).toBe("9:59");
  });

  it("clamps negative values to 0:00", () => {
    expect(formatClock(-5)).toBe("0:00");
  });

  it("rounds up partial seconds", () => {
    expect(formatClock(30.1)).toBe("0:31");
  });
});

describe("formatMinutes", () => {
  it("renders sub-minute values as seconds", () => {
    expect(formatMinutes(0.5)).toBe("30s");
  });

  it("renders minutes under an hour", () => {
    expect(formatMinutes(45)).toBe("45m");
  });

  it("renders whole hours without a minute suffix", () => {
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(120)).toBe("2h");
  });

  it("renders hours plus minutes", () => {
    expect(formatMinutes(90)).toBe("1h 30m");
  });
});
