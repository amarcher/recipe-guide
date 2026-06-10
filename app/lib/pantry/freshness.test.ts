import { describe, it, expect } from "vitest";
import {
  classifyFreshness,
  compareByUrgency,
  daysUntil,
  freshnessLabel,
  isNearExpiry,
} from "./freshness";

const NOW = new Date(2026, 5, 10, 18, 30); // Wed Jun 10, evening

function day(offset: number, hour = 9): Date {
  return new Date(2026, 5, 10 + offset, hour);
}

describe("daysUntil", () => {
  it("is calendar-day based, not 24h-window based", () => {
    // 9am tomorrow is < 24h from 6:30pm today but still "1 day away".
    expect(daysUntil(day(1, 9), NOW)).toBe(1);
    expect(daysUntil(day(0, 23), NOW)).toBe(0);
    expect(daysUntil(day(-1, 23), NOW)).toBe(-1);
  });

  it("handles longer spans", () => {
    expect(daysUntil(day(7), NOW)).toBe(7);
    expect(daysUntil(day(-3), NOW)).toBe(-3);
  });
});

describe("classifyFreshness", () => {
  it("classifies the whole range", () => {
    expect(classifyFreshness(null, NOW)).toBe("undated");
    expect(classifyFreshness(undefined, NOW)).toBe("undated");
    expect(classifyFreshness(day(-1), NOW)).toBe("expired");
    expect(classifyFreshness(day(0), NOW)).toBe("today");
    expect(classifyFreshness(day(1), NOW)).toBe("soon");
    expect(classifyFreshness(day(3), NOW)).toBe("soon");
    expect(classifyFreshness(day(4), NOW)).toBe("later");
  });

  it("respects a custom soon window", () => {
    expect(classifyFreshness(day(4), NOW, 5)).toBe("soon");
    expect(classifyFreshness(day(2), NOW, 1)).toBe("later");
  });
});

describe("isNearExpiry", () => {
  it("covers expired, today, and soon — not later or undated", () => {
    expect(isNearExpiry(day(-2), NOW)).toBe(true);
    expect(isNearExpiry(day(0), NOW)).toBe(true);
    expect(isNearExpiry(day(3), NOW)).toBe(true);
    expect(isNearExpiry(day(4), NOW)).toBe(false);
    expect(isNearExpiry(null, NOW)).toBe(false);
  });
});

describe("freshnessLabel", () => {
  it("speaks human", () => {
    expect(freshnessLabel(null, NOW)).toBeNull();
    expect(freshnessLabel(day(-1), NOW)).toBe("1 day past");
    expect(freshnessLabel(day(-2), NOW)).toBe("2 days past");
    expect(freshnessLabel(day(0), NOW)).toBe("Use today");
    expect(freshnessLabel(day(1), NOW)).toBe("Use by tomorrow");
    expect(freshnessLabel(day(2), NOW)).toBe("Use within 2 days");
    expect(freshnessLabel(day(10), NOW)).toMatch(/^Use by /);
  });
});

describe("compareByUrgency", () => {
  it("sorts dated ascending before undated, undated by recency", () => {
    const items = [
      { id: "undated-old", mustUseBy: null, addedAt: 100 },
      { id: "later", mustUseBy: day(5).getTime(), addedAt: 50 },
      { id: "undated-new", mustUseBy: null, addedAt: 200 },
      { id: "today", mustUseBy: day(0).getTime(), addedAt: 10 },
    ];
    const sorted = [...items].sort(compareByUrgency).map((i) => i.id);
    expect(sorted).toEqual(["today", "later", "undated-new", "undated-old"]);
  });
});
