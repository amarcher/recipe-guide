import { describe, it, expect } from "vitest";
import { checkCronAuth, type HeaderCarrier } from "./auth";

function req(authHeader: string | null): HeaderCarrier {
  return {
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "authorization" ? authHeader : null,
    },
  };
}

describe("checkCronAuth", () => {
  it("accepts the matching Bearer secret", () => {
    expect(checkCronAuth(req("Bearer s3cret"), "s3cret")).toEqual({ ok: true });
  });

  it("rejects a wrong secret with 401", () => {
    const r = checkCronAuth(req("Bearer nope"), "s3cret");
    expect(r).toEqual({ ok: false, status: 401, reason: "unauthorized" });
  });

  it("rejects a missing Authorization header with 401", () => {
    const r = checkCronAuth(req(null), "s3cret");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("rejects a raw secret without the Bearer prefix", () => {
    const r = checkCronAuth(req("s3cret"), "s3cret");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("fails closed with 503 when CRON_SECRET is unset", () => {
    const r = checkCronAuth(req("Bearer anything"), undefined);
    expect(r).toEqual({
      ok: false,
      status: 503,
      reason: "CRON_SECRET is not configured",
    });
  });

  it("treats a blank/whitespace secret as unconfigured", () => {
    const r = checkCronAuth(req("Bearer   "), "   ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(503);
  });
});
