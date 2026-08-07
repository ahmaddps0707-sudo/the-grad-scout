// Free-tier discover runs are LIFETIME (no reset).
// Paid discover + AI bullets reset each billing period.
export const FREE_LIMITS = {
  discover_runs: 3, // lifetime
  update_data_runs: 0, // gated on free
};

export const PAID_LIMITS = {
  discover_runs: 20, // per billing period
  ai_bullets: 50, // per billing period (counted on accept)
  update_data_runs: 10, // per billing period
};

export type SubscriptionSummary = {
  tier: "free" | "paid";
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "incomplete_expired" | "unpaid" | "paused" | null;
  discover_runs_used: number;
  ai_bullets_used: number;
  update_data_used: number;
  usage_reset_at: string | null;
};

export function isPaidTier(s: Pick<SubscriptionSummary, "tier" | "status">): boolean {
  // past_due does NOT grant access — a failed renewal revokes Pro immediately.
  return s.tier === "paid" && (s.status === "active" || s.status === "trialing" || s.status === "canceled");
}