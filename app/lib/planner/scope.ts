export type PlanScope = "WEEK" | "TONIGHT";

// One shared "which night/week is this plan for?" label so the list tile,
// intake header, and plan page never drift. weekOf holds tonight's date for
// TONIGHT-scoped plans.
export function planDateLabel(scope: PlanScope, weekOfMs: number): string {
  const date = new Date(weekOfMs).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return scope === "TONIGHT" ? `Tonight — ${date}` : `Week of ${date}`;
}

export function planTitle(scope: PlanScope): string {
  return scope === "TONIGHT" ? "Tonight's menu" : "Menu";
}

export function intakeTitle(scope: PlanScope): string {
  return scope === "TONIGHT" ? "Let's plan tonight" : "Let's plan the week";
}
