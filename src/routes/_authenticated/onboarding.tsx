import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { CountrySelect } from "@/components/country-select";

type ProfileUpd = Database["public"]["Tables"]["profiles"]["Update"];

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({ meta: [{ title: "Welcome — The Grad Scout" }] }),
  component: OnboardingPage,
});

const COUNTRIES = ["United States","United Kingdom","Canada","Germany","Netherlands","Australia","France","Switzerland","Singapore","Sweden","Ireland","Spain","Italy","Hong Kong","Japan"];
const MAJORS = ["Computer Science","Data Science","Business Analytics","MBA","Mechanical Engineering","Electrical Engineering","Public Policy","Economics","Finance","Marketing","Civil Engineering","Biotechnology","Public Health","Architecture","Design"];

const STEPS = ["Field of study","Destination","Tier & funding","Budget","Academics","Tests","Experience","Intake"];

function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [form, setForm] = useState({
    target_major: "",
    country_of_origin: "",
    target_countries: [] as string[],
    target_tier: "no_preference" as Database["public"]["Enums"]["tier_pref"],
    funding_preference: "partial_ok" as Database["public"]["Enums"]["funding_pref"],
    budget_ceiling: "" as string,
    budget_currency: "USD",
    gpa: "" as string,
    test_scores: { gre: "", gmat: "", ielts: "", toefl: "" } as Record<string,string>,
    work_exp_years: "" as string,
    target_intake: "Fall 2026",
  });

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).single();
      if (data) {
        if (data.onboarding_complete) {
          navigate({ to: "/dashboard" });
          return;
        }
        setForm((f) => ({
          ...f,
          target_major: data.target_major ?? "",
          country_of_origin: data.country_of_origin ?? "",
          target_countries: data.target_countries ?? [],
          target_tier: data.target_tier ?? f.target_tier,
          funding_preference: data.funding_preference ?? f.funding_preference,
          budget_ceiling: data.budget_ceiling != null ? String(data.budget_ceiling) : "",
          budget_currency: data.budget_currency ?? "USD",
          gpa: data.gpa != null ? String(data.gpa) : "",
          test_scores: { ...f.test_scores, ...(data.test_scores as Record<string,string> ?? {}) },
          work_exp_years: data.work_exp_years != null ? String(data.work_exp_years) : "",
          target_intake: data.target_intake ?? "Fall 2026",
        }));
      }
      setLoading(false);
    })();
  }, [navigate]);

  const autoSave = useCallback(async (next: typeof form) => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    setSaving(true);
    const upd: ProfileUpd = {
      target_major: next.target_major || null,
      country_of_origin: next.country_of_origin || null,
      target_countries: next.target_countries,
      target_tier: next.target_tier,
      funding_preference: next.funding_preference,
      budget_ceiling: next.budget_ceiling ? Number(next.budget_ceiling) : null,
      budget_currency: next.budget_currency,
      gpa: next.gpa ? Number(next.gpa) : null,
      test_scores: next.test_scores,
      work_exp_years: next.work_exp_years ? Number(next.work_exp_years) : null,
      target_intake: next.target_intake,
    };
    await supabase.from("profiles").update(upd).eq("id", u.user.id);
    setSaving(false);
  }, []);

  const update = (patch: Partial<typeof form>) => {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => autoSave(next), 600);
      return next;
    });
  };

  const toggleCountry = (c: string) => {
    update({ target_countries: form.target_countries.includes(c) ? form.target_countries.filter((x) => x !== c) : [...form.target_countries, c] });
  };

  const finish = async () => {
    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      await autoSave(form);
      await supabase.from("profiles").update({ onboarding_complete: true }).eq("id", u.user.id);
      const { data: job, error: jobErr } = await supabase.from("discover_jobs").insert({ user_id: u.user.id, status: "pending" }).select().single();
      if (jobErr) throw jobErr;
      // Fire and forget — dashboard will poll
      supabase.functions.invoke("discover-universities", { body: { job_id: job.id } }).catch((e) => console.error(e));
      navigate({ to: "/dashboard", search: { job: job.id } as never });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not complete onboarding");
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin h-6 w-6 text-muted-foreground" /></div>;
  }

  const progress = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="mb-8">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
            <span className="uppercase tracking-wider">Step {step + 1} of {STEPS.length}</span>
            <span>{saving ? "Saving…" : "Saved"}</span>
          </div>
          <div className="h-1 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <h1 className="mt-6 font-display text-3xl">{STEPS[step]}</h1>
        </div>

        <div className="rounded-2xl border border-border bg-surface-elevated p-8 space-y-6">
          {step === 0 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">We default to Master's degrees for now. Pick the field you want to study.</p>
              <div>
                <Label>Desired major / field of study</Label>
                <Select value={form.target_major} onValueChange={(v) => update({ target_major: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick a field" /></SelectTrigger>
                  <SelectContent>{MAJORS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Where are you from?</Label>
                <p className="text-xs text-muted-foreground mt-1">We use this to prioritize alumni from your country in the Outreach section.</p>
                <div className="mt-1.5">
                  <CountrySelect value={form.country_of_origin || null} onChange={(v) => update({ country_of_origin: v })} />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <Label>Desired countries (multi-select)</Label>
              <div className="grid grid-cols-2 gap-2">
                {COUNTRIES.map((c) => (
                  <label key={c} className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${form.target_countries.includes(c) ? "border-primary bg-secondary" : "border-border hover:bg-secondary/60"}`}>
                    <Checkbox checked={form.target_countries.includes(c)} onCheckedChange={() => toggleCountry(c)} />
                    <span className="text-sm">{c}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <Label>Target university tier</Label>
                <RadioGroup value={form.target_tier} onValueChange={(v) => update({ target_tier: v as typeof form.target_tier })} className="mt-2">
                  {[["top_10","Top 10"],["top_50","Top 50"],["top_100","Top 100"],["no_preference","No preference"]].map(([v,l]) => (
                    <label key={v} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 cursor-pointer">
                      <RadioGroupItem value={v} id={v} /><span className="text-sm">{l}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
              <div>
                <Label>Funding preference</Label>
                <RadioGroup value={form.funding_preference} onValueChange={(v) => update({ funding_preference: v as typeof form.funding_preference })} className="mt-2">
                  {[["fully_funded","Fully funded only"],["partial_ok","Partial funding OK"],["self_funded_ok","Self-funded OK"]].map(([v,l]) => (
                    <label key={v} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 cursor-pointer">
                      <RadioGroupItem value={v} id={`f-${v}`} /><span className="text-sm">{l}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Label>Budget ceiling (annual, all-in)</Label>
                <Input type="number" value={form.budget_ceiling} onChange={(e) => update({ budget_ceiling: e.target.value })} placeholder="e.g. 60000" className="mt-1.5" />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={form.budget_currency} onValueChange={(v) => update({ budget_currency: v })}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>{["USD","EUR","GBP","CAD","AUD","CHF","SGD"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <Label>Current GPA (on a 4.0 scale)</Label>
              <Input type="number" step="0.01" value={form.gpa} onChange={(e) => update({ gpa: e.target.value })} placeholder="3.6" className="mt-1.5 max-w-xs" />
              <p className="text-xs text-muted-foreground mt-2">Convert from your local scale where needed. You can skip and add later.</p>
            </div>
          )}

          {step === 5 && (
            <div className="grid grid-cols-2 gap-3">
              {(["gre","gmat","ielts","toefl"] as const).map((t) => (
                <div key={t}>
                  <Label className="uppercase">{t}</Label>
                  <Input value={form.test_scores[t]} onChange={(e) => update({ test_scores: { ...form.test_scores, [t]: e.target.value } })} placeholder="Score or 'not taken'" className="mt-1.5" />
                </div>
              ))}
              <p className="col-span-2 text-xs text-muted-foreground">All optional. Type "not taken" or leave blank.</p>
            </div>
          )}

          {step === 6 && (
            <div>
              <Label>Years of work experience</Label>
              <Input type="number" step="0.5" value={form.work_exp_years} onChange={(e) => update({ work_exp_years: e.target.value })} placeholder="2" className="mt-1.5 max-w-xs" />
            </div>
          )}

          {step === 7 && (
            <div>
              <Label>Target intake</Label>
              <Select value={form.target_intake} onValueChange={(v) => update({ target_intake: v })}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Fall 2026","Spring 2027","Fall 2027","Spring 2028","Fall 2028"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-border">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
            <div className="flex items-center gap-2">
              {step < STEPS.length - 1 && step >= 3 && (
                <Button variant="ghost" onClick={() => setStep((s) => s + 1)}>Skip for now</Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button
                  onClick={() => setStep((s) => s + 1)}
                  disabled={step === 0 && (!form.target_major || !form.country_of_origin)}
                >
                  Continue
                </Button>
              ) : (
                <Button onClick={finish} disabled={submitting}>
                  {submitting ? <><Loader2 className="animate-spin h-4 w-4 mr-2" /> Researching…</> : "Finish & find matches"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}