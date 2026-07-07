export const FREE_LIMITS = {
  discover_runs: 3,
  ai_bullets: 10,
  tracked_programs: 25,
};

export type SubscriptionSummary = {
  tier: "free" | "paid";
  status: "active" | "canceled" | "past_due" | null;
  discover_runs_used: number;
  ai_bullets_used: number;
  usage_reset_at: string | null;
};

export function isPaidTier(s: Pick<SubscriptionSummary, "tier" | "status">): boolean {
  return s.tier === "paid" && s.status === "active";
}