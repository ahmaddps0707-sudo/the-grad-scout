export function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12) return `${mo} month${mo === 1 ? "" : "s"} ago`;
  const y = Math.floor(mo / 12);
  return `${y} year${y === 1 ? "" : "s"} ago`;
}

export const POST_LIMIT_PER_HOUR = 5;
export const COMMENT_LIMIT_PER_HOUR = 15;

import { supabase } from "@/integrations/supabase/client";

/**
 * Check + increment a user's forum rate limit counter.
 * Returns { allowed, remaining } — if !allowed, do not proceed.
 */
export async function checkRateLimit(
  userId: string,
  kind: "post" | "comment",
): Promise<{ allowed: boolean; count: number; limit: number }> {
  const limit = kind === "post" ? POST_LIMIT_PER_HOUR : COMMENT_LIMIT_PER_HOUR;
  const field = kind === "post" ? "posts_last_hour" : "comments_last_hour";
  const { data } = await supabase
    .from("forum_rate_limits")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const now = Date.now();
  const expired = !data || now - new Date(data.last_reset_at).getTime() > 60 * 60 * 1000;
  const current = expired ? 0 : (data as any)[field] ?? 0;
  return { allowed: current < limit, count: current, limit };
}

export async function incrementRateLimit(userId: string, kind: "post" | "comment") {
  const field = kind === "post" ? "posts_last_hour" : "comments_last_hour";
  const { data } = await supabase
    .from("forum_rate_limits")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  const now = new Date();
  const expired = !data || now.getTime() - new Date(data.last_reset_at).getTime() > 60 * 60 * 1000;
  if (!data) {
    await supabase.from("forum_rate_limits").insert({
      user_id: userId,
      posts_last_hour: kind === "post" ? 1 : 0,
      comments_last_hour: kind === "comment" ? 1 : 0,
      last_reset_at: now.toISOString(),
    });
    return;
  }
  const updates: Record<string, any> = {};
  if (expired) {
    updates.posts_last_hour = kind === "post" ? 1 : 0;
    updates.comments_last_hour = kind === "comment" ? 1 : 0;
    updates.last_reset_at = now.toISOString();
  } else {
    updates[field] = ((data as any)[field] ?? 0) + 1;
  }
  await supabase.from("forum_rate_limits").update(updates).eq("user_id", userId);
}