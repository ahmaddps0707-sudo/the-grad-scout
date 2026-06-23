import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { STATUS_LABELS, STATUS_ORDER, type EntryStatus } from "@/lib/status";
import { scoreColorClass } from "@/lib/scoring";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

type EntryRow = Database["public"]["Tables"]["user_entries"]["Row"];
type Uni = Database["public"]["Tables"]["universities"]["Row"];
type Prog = Database["public"]["Tables"]["programs"]["Row"];
type Adm = Database["public"]["Tables"]["program_admissions"]["Row"];
type Cp = Database["public"]["Tables"]["program_class_profile"]["Row"];
type Fd = Database["public"]["Tables"]["program_funding"]["Row"];
type City = Database["public"]["Tables"]["program_city_info"]["Row"];
type Career = Database["public"]["Tables"]["program_career_stats"]["Row"];

export const Route = createFileRoute("/_authenticated/university/$id")({
  head: () => ({ meta: [{ title: "Program — Admitly" }] }),
  component: DetailPage,
});

function DetailPage() {
  const { id } = Route.useParams();
  const [entry, setEntry] = useState<(EntryRow & { university: Uni; program: Prog | null }) | null>(null);
  const [adm, setAdm] = useState<Adm | null>(null);
  const [cp, setCp] = useState<Cp | null>(null);
  const [fd, setFd] = useState<Fd | null>(null);
  const [city, setCity] = useState<City | null>(null);
  const [career, setCareer] = useState<Career | null>(null);
  const [sources, setSources] = useState<{ url: string }[]>([]);
  const [enriching, setEnriching] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("user_entries")
      .select("*, university:universities(*), program:programs(*)").eq("id", id).single();
    if (!data) return;
    setEntry(data as unknown as typeof entry);
    const pid = data.program_id;
    if (pid) {
      const [aRes, cRes, fRes, ciRes, coRes, sRes] = await Promise.all([
        supabase.from("program_admissions").select("*").eq("program_id", pid).maybeSingle(),
        supabase.from("program_class_profile").select("*").eq("program_id", pid).maybeSingle(),
        supabase.from("program_funding").select("*").eq("program_id", pid).maybeSingle(),
        supabase.from("program_city_info").select("*").eq("program_id", pid).maybeSingle(),
        supabase.from("program_career_stats").select("*").eq("program_id", pid).maybeSingle(),
        supabase.from("program_research_sources").select("url").eq("program_id", pid),
      ]);
      setAdm(aRes.data); setCp(cRes.data); setFd(fRes.data);
      setCity(ciRes.data); setCareer(coRes.data);
      setSources(sRes.data ?? []);
      const program = data.program as Prog | null;
      const stale = program?.last_verified_at && (Date.now() - new Date(program.last_verified_at).getTime() > 90 * 24 * 60 * 60 * 1000);
      const missing = !aRes.data || !cRes.data || !fRes.data || !ciRes.data || !coRes.data;
      if ((missing || stale) && !enriching) {
        triggerEnrich(pid, (data.university as Uni).name, (data.program as Prog).name, (data.university as Uni).website_url ?? "");
      }
    }
  }, [id, enriching]);

  const triggerEnrich = async (pid: string, uniName: string, progName: string, url: string) => {
    setEnriching(true);
    try {
      await supabase.functions.invoke("enrich-university", { body: { program_id: pid, university_name: uniName, program_name: progName, website_url: url } });
      await load();
    } catch (e) {
      console.error(e);
    } finally { setEnriching(false); }
  };

  useEffect(() => { load(); }, [load]);

  const setStatus = async (s: EntryStatus) => {
    if (!entry) return;
    setEntry({ ...entry, status: s });
    const { error } = await supabase.from("user_entries").update({ status: s }).eq("id", entry.id);
    if (error) toast.error(error.message);
  };

  if (!entry) {
    return <AppShell><div className="mx-auto max-w-5xl p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AppShell>;
  }

  const score = entry.score ?? 0;

  return (
    <AppShell>
      <div className="border-b border-border/60 bg-surface-elevated/70 backdrop-blur sticky top-[57px] z-20">
        <div className="mx-auto max-w-5xl px-6 py-5">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to pipeline
          </Link>
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <h1 className="font-display text-3xl leading-tight">{entry.university.name}</h1>
              <p className="text-muted-foreground mt-1">{entry.program?.name}</p>
              <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
                {entry.university.qs_ranking && <span>QS #{entry.university.qs_ranking}</span>}
                {entry.university.city && <span>{entry.university.city}{entry.university.country ? `, ${entry.university.country}` : ""}</span>}
                {entry.university.website_url && (
                  <a href={entry.university.website_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" /> Visit website
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className={`rounded-full border px-4 py-2 text-lg font-medium ${scoreColorClass(score)}`}>{score}</div>
              <Select value={entry.status} onValueChange={(v) => setStatus(v as EntryStatus)}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="admissions">Admissions</TabsTrigger>
            <TabsTrigger value="class">Class Profile</TabsTrigger>
            <TabsTrigger value="funding">Tuition & Funding</TabsTrigger>
            <TabsTrigger value="city">City</TabsTrigger>
            <TabsTrigger value="career">Career Outcomes</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-6 space-y-6">
            <Card title="Fit rationale">
              <p className="text-sm leading-relaxed text-foreground">{entry.match_rationale ?? <DV />}</p>
            </Card>
            <Card title="Program">
              <Row k="Department" v={entry.program?.department} />
              <Row k="Degree level" v={entry.program?.degree_level} />
              <Row k="STEM-designated" v={entry.program?.is_stem == null ? null : entry.program.is_stem ? "Yes" : "No"} />
            </Card>
            <Card title="Your notes">
              <NotesEditor entryId={entry.id} initial={entry.notes ?? ""} />
            </Card>
          </TabsContent>

          <TabsContent value="admissions" className="mt-6">
            {enriching && !adm ? <SkeletonCard /> : (
              <Card title="Admissions">
                <Row k="Deadline type" v={adm?.deadline_type} />
                <div className="py-2 border-b border-border last:border-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Deadlines</div>
                  {Array.isArray(adm?.deadlines) && adm!.deadlines.length ? (
                    <ul className="mt-1 text-sm space-y-1">
                      {(adm!.deadlines as Array<{round?:string;date?:string|null}>).map((d, i) => (
                        <li key={i}><span className="font-medium">{d.round ?? "Round"}:</span> {d.date ?? "TBA"}</li>
                      ))}
                    </ul>
                  ) : <DV />}
                </div>
                <div className="py-2 border-b border-border last:border-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Required materials</div>
                  {Array.isArray(adm?.required_materials) && adm!.required_materials.length ? (
                    <ul className="mt-1 text-sm list-disc list-inside space-y-0.5">
                      {(adm!.required_materials as string[]).map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  ) : <DV />}
                </div>
                <Row k="Test requirement" v={adm?.test_requirement_status} />
                <Row k="Application fee" v={adm?.application_fee ? `${adm.application_fee} ${adm.application_fee_currency ?? ""}` : null} />
                {entry.university.website_url && (
                  <div className="pt-4">
                    <Button asChild variant="outline" size="sm">
                      <a href={entry.university.website_url} target="_blank" rel="noreferrer">Open apply page <ExternalLink className="h-3.5 w-3.5 ml-1" /></a>
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </TabsContent>

          <TabsContent value="class" className="mt-6">
            {enriching && !cp ? <SkeletonCard /> : (
              <Card title="Class profile">
                <Row k="Average GRE" v={cp?.avg_gre} />
                <Row k="Average GMAT" v={cp?.avg_gmat} />
                <Row k="Average GPA" v={cp?.avg_gpa} />
                <Row k="Average IELTS" v={cp?.avg_ielts} />
                <Row k="Average TOEFL" v={cp?.avg_toefl} />
                <Row k="Class size" v={cp?.class_size} />
                <Row k="% International" v={cp?.intl_pct != null ? `${cp.intl_pct}%` : null} />
                <Row k="STEM-designated" v={entry.program?.is_stem == null ? null : entry.program.is_stem ? "Yes" : "No"} />
              </Card>
            )}
          </TabsContent>

          <TabsContent value="funding" className="mt-6">
            {enriching && !fd ? <SkeletonCard /> : (
              <Card title="Tuition & funding">
                <Row k="Tuition" v={fd?.tuition_amount ? `${fd.tuition_amount.toLocaleString()} ${fd.tuition_currency ?? ""}` : null} />
                <Row k="Tuition basis" v={fd?.tuition_per} />
                <Row k="Tuition as of" v={fd?.tuition_as_of} />
                <Row k="GA / TA / GRA available" v={fd?.ga_ta_gra_available == null ? null : fd.ga_ta_gra_available ? "Yes" : "No"} />
                <Row k="Assistantship notes" v={fd?.ga_ta_gra_notes} />
                <Row k="Tuition waiver with assistantship" v={fd?.tuition_waiver_with_assistantship == null ? null : fd.tuition_waiver_with_assistantship ? "Yes" : "No"} />
                <Row k="Scholarship notes" v={fd?.scholarship_notes} />
                <Row k="Estimated accommodation" v={
                  fd?.est_accommodation_low || fd?.est_accommodation_high
                    ? `${fd.est_accommodation_low ?? "?"} – ${fd.est_accommodation_high ?? "?"} ${fd.accommodation_currency ?? fd.tuition_currency ?? ""}`
                    : null
                } />
                <Row k="Estimated total cost of attendance" v={fd?.est_total_cost_of_attendance ? `${fd.est_total_cost_of_attendance.toLocaleString()} ${fd.tuition_currency ?? ""}` : null} />
              </Card>
            )}
          </TabsContent>

          <TabsContent value="city" className="mt-6">
            {enriching && !city ? <SkeletonCard /> : (
              <Card title="City">
                <Row k="City" v={city?.city_name} />
                <Row k="Vibe" v={city?.city_vibe} />
                <Row k="Nearest major city" v={city?.nearest_major_city} />
                <Row k="Distance" v={city?.distance_to_major_city_km != null ? `${city.distance_to_major_city_km} km` : null} />
                <Row k="Travel time" v={city?.travel_time_to_major_city} />
              </Card>
            )}
          </TabsContent>

          <TabsContent value="career" className="mt-6">
            {enriching && !career ? <SkeletonCard /> : (
              <Card title="Career outcomes">
                <Row k="Placement rate" v={career?.placement_rate_pct != null ? `${career.placement_rate_pct}%` : null} />
                <Row k="Average salary" v={career?.avg_salary != null ? `${Number(career.avg_salary).toLocaleString()} ${career.avg_salary_currency ?? ""}` : null} />
                <Row k="Top employers" v={Array.isArray(career?.top_employers) && (career!.top_employers as string[]).length ? (career!.top_employers as string[]).join(", ") : null} />
                <Row k="Top industries" v={Array.isArray(career?.top_industries) && (career!.top_industries as string[]).length ? (career!.top_industries as string[]).join(", ") : null} />
                <Row k="International student salary note" v={career?.intl_student_salary_note} />
                <Row k="Notes" v={career?.salary_breakdown_notes} />
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {sources.length > 0 && (
          <div className="mt-8 text-xs text-muted-foreground">
            <div className="uppercase tracking-wider mb-2">Research sources</div>
            <ul className="space-y-1">
              {sources.map((s, i) => (
                <li key={i}><a className="hover:text-foreground underline" href={s.url} target="_blank" rel="noreferrer">{s.url}</a></li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-6">
      <h3 className="font-display text-lg mb-3">{title}</h3>
      <div>{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{k}</span>
      <span className="text-sm text-foreground text-right">{v == null || v === "" ? <DV /> : v}</span>
    </div>
  );
}

function DV() { return <span className="text-muted-foreground italic">Not publicly available</span>; }
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-6 space-y-3">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

function NotesEditor({ entryId, initial }: { entryId: string; initial: string }) {
  const [notes, setNotes] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (notes === initial) return;
      setSaving(true);
      await supabase.from("user_entries").update({ notes }).eq("id", entryId);
      setSaving(false);
    }, 600);
    return () => clearTimeout(t);
  }, [notes, initial, entryId]);
  return (
    <div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add personal notes about this program…"
        className="w-full min-h-[100px] rounded-md border border-border bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <div className="text-xs text-muted-foreground mt-1">{saving ? "Saving…" : "Saved"}</div>
    </div>
  );
}