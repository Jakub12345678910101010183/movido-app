import { describe, expect, it } from "vitest";
import { entitlementUpdate, isUnpaidStart, planStatus } from "../../../supabase/functions/stripe-webhook/entitlement.ts";

// Mirrors public.my_org_has_access() (20260927141239_subscription_access.sql).
type Org = { plan_status: string; trial_ends_at: string | null; plan: string; max_vehicles: number };
const hasAccess = (o: Org, now: Date) =>
  o.plan_status === "active" || o.plan_status === "past_due" ||
  (o.plan_status === "trial" && o.trial_ends_at !== null && new Date(o.trial_ends_at) > now);

const now = new Date("2026-10-04T12:00:00Z");
const base = { customerId: "cus_test", plan: "professional" as const, quantity: 500, trialEnd: null, now };

function apply(org: Org, status: string): Org {
  return { ...org, ...entitlementUpdate({ ...base, status }) } as Org;
}

describe("stripe-webhook entitlement (ST-7)", () => {
  const expiredTrial: Org = { plan_status: "trial", trial_ends_at: "2026-09-01T00:00:00Z", plan: "starter", max_vehicles: 5 };
  const liveTrial: Org = { plan_status: "trial", trial_ends_at: "2026-10-10T00:00:00Z", plan: "starter", max_vehicles: 5 };

  it("an incomplete subscription (first payment not made) grants no access, plan or vehicle limit", () => {
    const after = apply(expiredTrial, "incomplete");
    expect(hasAccess(after, now)).toBe(false);
    expect(after).toMatchObject({ plan_status: "trial", plan: "starter", max_vehicles: 5 });
  });

  it("an incomplete subscription leaves a live trial as it was", () => {
    expect(apply(liveTrial, "incomplete")).toMatchObject({ plan_status: "trial", trial_ends_at: liveTrial.trial_ends_at, max_vehicles: 5 });
  });

  it("an abandoned first payment (incomplete_expired) does not cancel a live trial", () => {
    const after = apply(apply(liveTrial, "incomplete"), "incomplete_expired");
    expect(after.plan_status).toBe("trial");
    expect(hasAccess(after, now)).toBe(true);
  });

  it("only links the Stripe customer for unpaid starts", () => {
    for (const s of ["incomplete", "incomplete_expired"]) {
      expect(isUnpaidStart(s)).toBe(true);
      expect(entitlementUpdate({ ...base, status: s })).toEqual({ stripe_customer_id: "cus_test", updated_at: now.toISOString() });
    }
  });

  it("paid statuses still grant the plan and limit", () => {
    const after = apply(expiredTrial, "active");
    expect(after).toMatchObject({ plan_status: "active", plan: "professional", max_vehicles: 500 });
    expect(hasAccess(after, now)).toBe(true);
    expect(apply(after, "past_due").plan_status).toBe("past_due");
  });

  it("keeps the other status mappings", () => {
    expect(planStatus("trialing")).toBe("trial");
    expect(planStatus("unpaid")).toBe("unpaid");
    expect(planStatus("canceled")).toBe("cancelled");
    expect(planStatus("paused")).toBe("cancelled");
    expect(entitlementUpdate({ ...base, status: "trialing", trialEnd: 1791000000 }).trial_ends_at)
      .toBe(new Date(1791000000 * 1000).toISOString());
  });
});
