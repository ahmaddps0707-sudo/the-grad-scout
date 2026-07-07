// Free-tier limits and monthly reset helper.
// deno-lint-ignore-file no-explicit-any

export const FREE_LIMITS = {
  discover_runs: 3,
  ai_bullets: 10,
  tracked_programs: 25,
};

/**
 * Ensure the usage window is current. If usage_reset_at is in the past,
 * zero the counters and roll the window to the next month. Returns the
 * (possibly refreshed) profile row.
 */
export async function ensureUsageWindow(admin: any, profile: any) {
  const resetAt = profile.usage_reset_at ? new Date(profile.usage_reset_at) : null;
  if (!resetAt || resetAt.getTime() <= Date.now()) {
    const next = new Date();
    next.setUTCMonth(next.getUTCMonth() + 1, 1);
    next.setUTCHours(0, 0, 0, 0);
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