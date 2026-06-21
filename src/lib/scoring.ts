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
  const targetCountries = (profile.target_countries ?? []) as string[];
  if (p.country && targetCountries.length && targetCountries.map((c) => c.toLowerCase()).includes(p.country.toLowerCase())) {
    score += 18;
  }
  const rank = p.qs_ranking ?? 999;
  const tierBonus = {
    top_10: rank <= 10 ? 22 : rank <= 50 ? 6 : -8,
    top_50: rank <= 50 ? 18 : rank <= 100 ? 4 : -6,
    top_100: rank <= 100 ? 14 : rank <= 200 ? 2 : -4,
    no_preference: rank <= 100 ? 10 : rank <= 300 ? 4 : 0,
  } as const;
  score += tierBonus[(profile.target_tier ?? "no_preference") as keyof typeof tierBonus] ?? 0;
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