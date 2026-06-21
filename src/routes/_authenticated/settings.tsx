import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Admitly" }] }),
  component: SettingsPage,
});

const COUNTRIES = ["United States","United Kingdom","Canada","Germany","Netherlands","Australia","France","Switzerland","Singapore","Sweden","Ireland","Spain","Italy","Hong Kong","Japan"];

function SettingsPage() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).single();
      setProfile(data);
    })();
  }, []);

  if (!profile) return <AppShell><div className="mx-auto max-w-3xl p-8">Loading…</div></AppShell>;

  const update = (patch: Partial<ProfileRow>) => setProfile((p) => p ? { ...p, ...patch } : p);
  const toggleCountry = (c: string) => {
    const arr = profile.target_countries ?? [];
    update({ target_countries: arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c] });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: profile.full_name,
      target_major: profile.target_major,
      target_countries: profile.target_countries,
      target_tier: profile.target_tier,
      funding_preference: profile.funding_preference,
      budget_ceiling: profile.budget_ceiling,
      budget_currency: profile.budget_currency,
      gpa: profile.gpa,
      test_scores: profile.test_scores,
      work_exp_years: profile.work_exp_years,
      target_intake: profile.target_intake,
    }).eq("id", profile.id);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  const ts = (profile.test_scores ?? {}) as Record<string, string>;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-8">
        <h1 className="font-display text-3xl">Settings</h1>

        <section className="rounded-2xl border border-border bg-surface-elevated p-6 space-y-5">
          <h2 className="font-display text-xl">Profile</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Full name</Label>
              <Input value={profile.full_name ?? ""} onChange={(e) => update({ full_name: e.target.value })} className="mt-1.5" />
            </div>
            <div className="col-span-2">
              <Label>Desired major</Label>
              <Input value={profile.target_major ?? ""} onChange={(e) => update({ target_major: e.target.value })} className="mt-1.5" />
            </div>
            <div className="col-span-2">
              <Label>Target countries</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {COUNTRIES.map((c) => (
                  <label key={c} className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer ${profile.target_countries?.includes(c) ? "border-primary bg-secondary" : "border-border"}`}>
                    <Checkbox checked={profile.target_countries?.includes(c) ?? false} onCheckedChange={() => toggleCountry(c)} />
                    <span className="text-sm">{c}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label>Tier</Label>
              <Select value={profile.target_tier ?? "no_preference"} onValueChange={(v) => update({ target_tier: v as ProfileRow["target_tier"] })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="top_10">Top 10</SelectItem>
                  <SelectItem value="top_50">Top 50</SelectItem>
                  <SelectItem value="top_100">Top 100</SelectItem>
                  <SelectItem value="no_preference">No preference</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Funding</Label>
              <Select value={profile.funding_preference ?? "partial_ok"} onValueChange={(v) => update({ funding_preference: v as ProfileRow["funding_preference"] })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fully_funded">Fully funded only</SelectItem>
                  <SelectItem value="partial_ok">Partial OK</SelectItem>
                  <SelectItem value="self_funded_ok">Self-funded OK</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Budget ceiling</Label>
              <Input type="number" value={profile.budget_ceiling ?? ""} onChange={(e) => update({ budget_ceiling: e.target.value ? Number(e.target.value) : null })} className="mt-1.5" />
            </div>
            <div>
              <Label>Currency</Label>
              <Select value={profile.budget_currency ?? "USD"} onValueChange={(v) => update({ budget_currency: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>{["USD","EUR","GBP","CAD","AUD","CHF","SGD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>GPA</Label>
              <Input type="number" step="0.01" value={profile.gpa ?? ""} onChange={(e) => update({ gpa: e.target.value ? Number(e.target.value) : null })} className="mt-1.5" />
            </div>
            <div>
              <Label>Work experience (years)</Label>
              <Input type="number" step="0.5" value={profile.work_exp_years ?? ""} onChange={(e) => update({ work_exp_years: e.target.value ? Number(e.target.value) : null })} className="mt-1.5" />
            </div>
            {(["gre","gmat","ielts","toefl"] as const).map((t) => (
              <div key={t}>
                <Label className="uppercase">{t}</Label>
                <Input value={ts[t] ?? ""} onChange={(e) => update({ test_scores: { ...ts, [t]: e.target.value } })} className="mt-1.5" />
              </div>
            ))}
            <div className="col-span-2">
              <Label>Target intake</Label>
              <Input value={profile.target_intake ?? ""} onChange={(e) => update({ target_intake: e.target.value })} className="mt-1.5" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface-elevated p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-display text-xl">Subscription</h2>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant="secondary">Free plan</Badge>
                <span className="text-sm text-muted-foreground">Up to 25 tracked programs</span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground max-w-md">Upgrade to Admitly Pro for unlimited matches, deeper enrichment, and priority research runs.</p>
            </div>
            <Button variant="outline" disabled>Upgrade (coming soon)</Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}