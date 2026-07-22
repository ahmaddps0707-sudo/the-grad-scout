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
import { Lock } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { FREE_LIMITS, PAID_LIMITS, isPaidTier } from "@/lib/limits";
import { UpgradeModal } from "@/components/upgrade-modal";
import { Progress } from "@/components/ui/progress";
import { createPortalSession } from "@/utils/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";
import { PaymentTestModeBanner } from "@/components/payment-test-mode-banner";
import { CountrySelect } from "@/components/country-select";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Admitly" }] }),
  component: SettingsPage,
});

const COUNTRIES = ["United States","United Kingdom","Canada","Germany","Netherlands","Australia","France","Switzerland","Singapore","Sweden","Ireland","Spain","Italy","Hong Kong","Japan"];

function SettingsPage() {
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [email, setEmail] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setEmail(u.user.email ?? "");
      const { data } = await supabase.from("profiles").select("*").eq("id", u.user.id).single();
      setProfile(data);
      const { data: pay } = await supabase
        .from("payment_history")
        .select("*")
        .eq("user_id", u.user.id)
        .order("paid_at", { ascending: false })
        .limit(20);
      setPayments(pay ?? []);
    })();
  }, []);

  if (!profile) return <AppShell><div className="mx-auto max-w-3xl p-8">Loading…</div></AppShell>;

  const p = profile as any;
  const paid = isPaidTier({ tier: p.subscription_tier ?? "free", status: p.subscription_status ?? null });
  const discoverUsed = p.discover_runs_used ?? 0;
  const aiUsed = p.ai_bullets_used ?? 0;
  const resetAt = p.usage_reset_at ? new Date(p.usage_reset_at) : null;
  const status = p.subscription_status as string | null;
  const trialEnd = p.trial_end_date ? new Date(p.trial_end_date) : null;
  const periodEnd = p.subscription_current_period_end ? new Date(p.subscription_current_period_end) : null;
  const cancelAtEnd = !!p.cancel_at_period_end;
  const isTrialing = status === "trialing";

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const result = await createPortalSession({
        data: { environment: getStripeEnvironment(), returnUrl: `${window.location.origin}/settings` },
      });
      if ("error" in result) throw new Error(result.error);
      window.open(result.url, "_blank");
    } catch (e: any) {
      toast.error(e.message ?? "Could not open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const update = (patch: Partial<ProfileRow>) => setProfile((p) => p ? { ...p, ...patch } : p);
  const toggleCountry = (c: string) => {
    const arr = profile.target_countries ?? [];
    update({ target_countries: arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c] });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      full_name: profile.full_name,
      country_of_origin: (profile as any).country_of_origin ?? null,
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
      <PaymentTestModeBanner />
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-8">
        <h1 className="font-display text-3xl">Settings</h1>

        <section className="rounded-2xl border border-border bg-surface-elevated p-6 space-y-5">
          <h2 className="font-display text-xl">Profile</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Email address</Label>
              <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-3 py-2">
                <span className="text-sm text-foreground">{email || "—"}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="h-3 w-3" /> Cannot be changed</span>
              </div>
            </div>
            <div className="col-span-2">
              <Label>Full name</Label>
              <Input value={profile.full_name ?? ""} onChange={(e) => update({ full_name: e.target.value })} className="mt-1.5" />
            </div>
            <div className="col-span-2">
              <Label>Where are you from?</Label>
              <p className="text-xs text-muted-foreground mt-1">We use this to prioritize alumni from your country in the Outreach section.</p>
              <div className="mt-1.5">
                <CountrySelect
                  value={(profile as any).country_of_origin ?? null}
                  onChange={(v) => update({ country_of_origin: v } as Partial<ProfileRow>)}
                />
              </div>
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
                {paid ? <Badge>Pro plan</Badge> : <Badge variant="secondary">Free plan</Badge>}
                {isTrialing && <Badge variant="secondary">Trial</Badge>}
                {status === "past_due" && <Badge variant="destructive">Past due</Badge>}
                {cancelAtEnd && <Badge variant="secondary">Cancels at period end</Badge>}
                {!paid && <span className="text-sm text-muted-foreground">{FREE_LIMITS.discover_runs} lifetime discover runs</span>}
              </div>
              {isTrialing && trialEnd && (
                <p className="mt-2 text-sm text-muted-foreground">Trial ends {trialEnd.toLocaleDateString()}.</p>
              )}
              {paid && periodEnd && !isTrialing && (
                <p className="mt-2 text-sm text-muted-foreground">
                  {cancelAtEnd ? "Access until " : "Renews on "} {periodEnd.toLocaleDateString()}.
                </p>
              )}
              {!paid && (
                <p className="mt-3 text-sm text-muted-foreground max-w-md">Upgrade to Admitly Pro for 20 program discovers, unlimited AI resume assistance, and priority research runs.</p>
              )}
            </div>
            {!paid ? (
              <Button onClick={() => setUpgradeOpen(true)} className="gap-2">Upgrade to Pro</Button>
            ) : (
              <Button variant="outline" onClick={openPortal} disabled={portalLoading}>
                {portalLoading ? "Opening…" : "Manage billing"}
              </Button>
            )}
          </div>
          <div className="mt-6 space-y-4">
            <div>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="text-muted-foreground">{paid ? "Discover runs this billing period" : "Discover runs (lifetime on Free)"}</span>
                <span className="tabular-nums">{Math.min(discoverUsed, paid ? PAID_LIMITS.discover_runs : FREE_LIMITS.discover_runs)} / {paid ? PAID_LIMITS.discover_runs : FREE_LIMITS.discover_runs}</span>
              </div>
              <Progress value={Math.min(100, (discoverUsed / (paid ? PAID_LIMITS.discover_runs : FREE_LIMITS.discover_runs)) * 100)} />
            </div>
            {paid && (
              <div>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-muted-foreground">AI resume bullets accepted this billing period</span>
                  <span className="tabular-nums">{Math.min(aiUsed, PAID_LIMITS.ai_bullets)} / {PAID_LIMITS.ai_bullets}</span>
                </div>
                <Progress value={Math.min(100, (aiUsed / PAID_LIMITS.ai_bullets) * 100)} />
              </div>
            )}
            {paid && resetAt && (
              <p className="text-xs text-muted-foreground">Resets on {resetAt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.</p>
            )}
          </div>
          {payments.length > 0 && (
            <div className="mt-6 border-t border-border pt-5">
              <h3 className="font-display text-lg mb-3">Payment history</h3>
              <div className="space-y-2">
                {payments.map((pay) => (
                  <div key={pay.id} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-b-0">
                    <div>
                      <div className="tabular-nums">
                        {(pay.amount_cents / 100).toLocaleString(undefined, { style: "currency", currency: (pay.currency ?? "usd").toUpperCase() })}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {pay.paid_at ? new Date(pay.paid_at).toLocaleDateString() : "—"} · {pay.status}
                      </div>
                    </div>
                    {pay.hosted_invoice_url && (
                      <a href={pay.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                        View invoice
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
        <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} />
      </div>
    </AppShell>
  );
}