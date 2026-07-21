import { describe, expect, it } from "vitest";
import { intakeTitle, planDateLabel, planTitle } from "./scope";

const JUL_21_2026 = new Date(2026, 6, 21).getTime();

describe("planDateLabel", () => {
  it("labels week plans by their Monday", () => {
    expect(planDateLabel("WEEK", JUL_21_2026)).toBe("Week of Jul 21");
  });

  it("labels tonight plans by the single night", () => {
    expect(planDateLabel("TONIGHT", JUL_21_2026)).toBe("Tonight — Jul 21");
  });
});

describe("titles", () => {
  it("distinguishes scope in page titles", () => {
    expect(planTitle("WEEK")).toBe("Menu");
    expect(planTitle("TONIGHT")).toBe("Tonight's menu");
    expect(intakeTitle("WEEK")).toBe("Let's plan the week");
    expect(intakeTitle("TONIGHT")).toBe("Let's plan tonight");
  });
});
