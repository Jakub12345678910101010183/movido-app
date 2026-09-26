/**
 * One-line plan status for office users: days left in the trial, or what to
 * do when the trial has ended / a payment failed / the plan was cancelled.
 * Informational only — see lib/subscription.ts.
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/contexts/AuthContext";
import { subscriptionState, type SubscriptionState } from "@/lib/subscription";

export default function PlanBanner() {
  const { profile } = useAuthContext();
  const [state, setState] = useState<SubscriptionState | null>(null);
  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!profile?.organization_id) return;
    let cancelled = false;
    supabase.from("organizations").select("plan_status, trial_ends_at").maybeSingle()
      .then(({ data }) => { if (!cancelled && data) setState(subscriptionState(data)); });
    return () => { cancelled = true; };
  }, [profile?.organization_id]);

  if (!state || state.kind === "active" || (state.kind === "trial" && state.daysLeft === null)) return null;

  const action = isAdmin
    ? <Link href="/pricing" className="font-medium text-primary hover:underline">View plans</Link>
    : <span>Ask your administrator to choose a plan.</span>;

  const warn = state.kind !== "trial";
  const text =
    state.kind === "trial" ? `Free trial: ${state.daysLeft} day${state.daysLeft === 1 ? "" : "s"} left. No card needed until you subscribe.`
    : state.kind === "trial_ended" ? "Your free trial has ended. Choose a plan to subscribe."
    : state.kind === "past_due" ? "Your last payment failed. Stripe emails your billing contact a link to pay; contact us if you need help."
    : "Your subscription is cancelled. Choose a plan to subscribe again.";

  return (
    <div role="status" className={`flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2 text-xs ${warn ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-border bg-muted/30 text-muted-foreground"}`}>
      <span>{text}</span>
      {state.kind !== "past_due" && action}
    </div>
  );
}
