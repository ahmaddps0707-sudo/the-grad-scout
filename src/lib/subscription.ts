// Env-scoped subscription reads. Sandbox and live rows live on the same
// profiles record via mirror columns; pick the right set based on the
// caller's Stripe environment.
import type { StripeEnv } from "@/lib/stripe";

export type SubView = {
  tier: "free" | "paid";
  status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  trial_end_date: string | null;
  subscription_start_date: string | null;
  discover_runs_used: number;
  ai_bullets_used: number;
  usage_reset_at: string | null;
  trial_used: boolean;
};

export function envScopedSub(profile: any, env: StripeEnv): SubView {
  const p = profile ?? {};
  if (env === "sandbox") {
    return {
      tier: (p.sandbox_subscription_tier ?? "free") as "free" | "paid",
      status: p.sandbox_subscription_status ?? null,
      stripe_customer_id: p.sandbox_stripe_customer_id ?? null,
      stripe_subscription_id: p.sandbox_stripe_subscription_id ?? null,
      current_period_end: p.sandbox_subscription_current_period_end ?? null,
      cancel_at_period_end: !!p.sandbox_cancel_at_period_end,
      trial_end_date: p.sandbox_trial_end_date ?? null,
      subscription_start_date: p.sandbox_subscription_start_date ?? null,
      discover_runs_used: p.sandbox_discover_runs_used ?? 0,
      ai_bullets_used: p.sandbox_ai_bullets_used ?? 0,
      usage_reset_at: p.sandbox_usage_reset_at ?? null,
      trial_used: !!p.sandbox_trial_used,
    };
  }
  return {
    tier: (p.subscription_tier ?? "free") as "free" | "paid",
    status: p.subscription_status ?? null,
    stripe_customer_id: p.stripe_customer_id ?? null,
    stripe_subscription_id: p.stripe_subscription_id ?? null,
    current_period_end: p.subscription_current_period_end ?? null,
    cancel_at_period_end: !!p.cancel_at_period_end,
    trial_end_date: p.trial_end_date ?? null,
    subscription_start_date: p.subscription_start_date ?? null,
    discover_runs_used: p.discover_runs_used ?? 0,
    ai_bullets_used: p.ai_bullets_used ?? 0,
    usage_reset_at: p.usage_reset_at ?? null,
    trial_used: !!p.trial_used,
  };
}

// Column-name maps used by the webhook and server-side updates. Keeps
// sandbox and live writes symmetric without repeating column literals.
export function subColumns(env: StripeEnv) {
  const s = env === "sandbox";
  return {
    tier: s ? "sandbox_subscription_tier" : "subscription_tier",
    status: s ? "sandbox_subscription_status" : "subscription_status",
    customerId: s ? "sandbox_stripe_customer_id" : "stripe_customer_id",
    subscriptionId: s ? "sandbox_stripe_subscription_id" : "stripe_subscription_id",
    periodEnd: s ? "sandbox_subscription_current_period_end" : "subscription_current_period_end",
    cancelAtEnd: s ? "sandbox_cancel_at_period_end" : "cancel_at_period_end",
    trialEnd: s ? "sandbox_trial_end_date" : "trial_end_date",
    startDate: s ? "sandbox_subscription_start_date" : "subscription_start_date",
    discoverUsed: s ? "sandbox_discover_runs_used" : "discover_runs_used",
    aiUsed: s ? "sandbox_ai_bullets_used" : "ai_bullets_used",
    resetAt: s ? "sandbox_usage_reset_at" : "usage_reset_at",
    trialUsed: s ? "sandbox_trial_used" : "trial_used",
  };
}