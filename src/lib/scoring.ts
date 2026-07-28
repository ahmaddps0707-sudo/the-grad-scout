import type { Database } from "@/integrations/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export interface ScoreableProgram {
  country?: string | null;
  qs_ranking?: number | null;
  is_stem?: boolean | null;
}

export function computeMatchScore(profile: Partial<Profile> | null, p: ScoreableProgram): number {
  if (!profile) return 50;
  let score = 50;
  const targetCountry = (profile.target_country ?? "").toLowerCase().trim();
  if (p.country && targetCountry && p.country.toLowerCase().trim() === targetCountry) {
    score += 18;
  }
  const rank = p.qs_ranking ?? 999;
  const tier = profile.target_tier ?? null;
  if (tier === "top_50") score += rank <= 50 ? 18 : rank <= 100 ? 4 : -6;
  else if (tier === "top_100") score += rank <= 100 ? 14 : rank <= 200 ? 2 : -4;
  else if (tier === "top_200") score += rank <= 200 ? 12 : rank <= 500 ? 2 : -4;
  else if (tier === "rank_201_500") score += rank >= 201 && rank <= 500 ? 12 : 0;
  else if (tier === "rank_500_plus") score += rank > 500 ? 10 : 0;
  else score += rank <= 100 ? 10 : rank <= 300 ? 4 : 0;
  if (p.is_stem) score += 4;
  const gpa = Number(profile.gpa ?? 0);
  if (gpa >= 3.7) score += 6;
  else if (gpa >= 3.3) score += 3;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreColorClass(score: number): string {
  if (score >= 80) return "bg-[color:var(--success)]/15 text-[color:var(--success)] border-[color:var(--success)]/30";
  if (score >= 60) return "bg-accent/20 text-accent-foreground border-accent/40";
  return "bg-muted text-muted-foreground border-border";
}