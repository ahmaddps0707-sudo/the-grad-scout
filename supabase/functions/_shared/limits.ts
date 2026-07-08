// Free-tier limits and monthly reset helper.
// deno-lint-ignore-file no-explicit-any

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
export async function ensureUsageWindow(admin: any, profile: any) {
  if (!isPaid(profile)) return profile;
  const resetAt = profile.usage_reset_at ? new Date(profile.usage_reset_at) : null;
  if (!resetAt || resetAt.getTime() <= Date.now()) {
    const next = new Date();
    next.setUTCMonth(next.getUTCMonth() + 1, next.getUTCDate());
    const { data, error } = await admin
      .from("profiles")
      .update({ discover_runs_used: 0, ai_bullets_used: 0, usage_reset_at: next.toISOString() })
      .eq("id", profile.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  return profile;
}

export function isPaid(profile: any): boolean {
  return profile?.subscription_tier === "paid" && profile?.subscription_status === "active";
}