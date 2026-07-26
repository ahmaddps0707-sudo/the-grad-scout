// Free-tier limits and monthly reset helper.
// deno-lint-ignore-file no-explicit-any

export type StripeEnv = "sandbox" | "live";

export function envColumns(env: StripeEnv) {
  const s = env === "sandbox";
  return {
    tier: s ? "sandbox_subscription_tier" : "subscription_tier",
    status: s ? "sandbox_subscription_status" : "subscription_status",
    periodEnd: s ? "sandbox_subscription_current_period_end" : "subscription_current_period_end",
    discoverUsed: s ? "sandbox_discover_runs_used" : "discover_runs_used",
    aiUsed: s ? "sandbox_ai_bullets_used" : "ai_bullets_used",
    resetAt: s ? "sandbox_usage_reset_at" : "usage_reset_at",
  };
}

// Extracts env-scoped subscription/usage view from a profile row.
export function envView(profile: any, env: StripeEnv) {
  const c = envColumns(env);
  return {
    tier: (profile?.[c.tier] ?? "free") as "free" | "paid",
    status: profile?.[c.status] ?? null,
    periodEnd: profile?.[c.periodEnd] ?? null,
    discoverUsed: profile?.[c.discoverUsed] ?? 0,
    aiUsed: profile?.[c.aiUsed] ?? 0,
    resetAt: profile?.[c.resetAt] ?? null,
  };
}

// Free discover runs are LIFETIME (never reset).
export const FREE_LIMITS = {
  discover_runs: 3,
};

// Paid users get per-billing-period allotments.
export const PAID_LIMITS = {
  discover_runs: 20,
  ai_bullets: 50,
};

/**
 * Ensure the usage window is current. If usage_reset_at is in the past,
 * zero the counters and roll the window to the next month. Returns the
 * (possibly refreshed) profile row.
 */
// Only paid users get periodic resets. Free tier discover runs are lifetime.
// Env-scoped: reads and resets the columns for the caller's Stripe environment.
export async function ensureUsageWindow(admin: any, profile: any, env: StripeEnv = "sandbox") {
  if (!isPaid(profile, env)) return profile;
  const c = envColumns(env);
  const resetAt = profile[c.resetAt] ? new Date(profile[c.resetAt]) : null;
  if (!resetAt || resetAt.getTime() <= Date.now()) {
    const next = new Date();
    next.setUTCMonth(next.getUTCMonth() + 1, next.getUTCDate());
    const update: Record<string, unknown> = {};
    update[c.discoverUsed] = 0;
    update[c.aiUsed] = 0;
    update[c.resetAt] = next.toISOString();
    const { data, error } = await admin
      .from("profiles").update(update).eq("id", profile.id).select().single();
    if (error) throw error;
    return data;
  }
  return profile;
}

export function isPaid(profile: any, env: StripeEnv = "sandbox"): boolean {
  const v = envView(profile, env);
  if (v.tier !== "paid") return false;
  const status = v.status;
  if (status === "active" || status === "trialing" || status === "past_due") return true;
  if (status === "canceled" && v.periodEnd) {
    return new Date(v.periodEnd).getTime() > Date.now();
  }
  return false;
}

export function parseEnv(input: unknown): StripeEnv {
  return input === "live" ? "live" : "sandbox";
}