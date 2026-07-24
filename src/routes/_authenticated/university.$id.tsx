import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Loader2, RefreshCw, Info } from "lucide-react";
import { STATUS_LABELS, STATUS_ORDER, type EntryStatus } from "@/lib/status";
import { scoreColorClass } from "@/lib/scoring";
import type { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { OutreachTab } from "@/components/outreach-tab";
import { NewPostDialog } from "@/components/forum/new-post-dialog";
import { timeAgo } from "@/lib/forum-utils";
import { Heart, MessageSquare } from "lucide-react";

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
  const router = useRouter();
  const [entry, setEntry] = useState<(EntryRow & { university: Uni; program: Prog | null }) | null>(null);
  const [adm, setAdm] = useState<Adm | null>(null);
  const [cp, setCp] = useState<Cp | null>(null);
  const [fd, setFd] = useState<Fd | null>(null);
  const [city, setCity] = useState<City | null>(null);
  const [career, setCareer] = useState<Career | null>(null);
  const [sources, setSources] = useState<{ url: string }[]>([]);
  const [enriching, setEnriching] = useState(false);
  const [userCountry, setUserCountry] = useState<string | null>(null);
  const [discussions, setDiscussions] = useState<Array<{ id: string; title: string; is_anonymous: boolean; author_name: string | null; created_at: string; like_count: number; comment_count: number }>>([]);
  const [openNewPost, setOpenNewPost] = useState(false);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      const { data: prof } = await supabase.from("profiles").select("country_of_origin").eq("id", u.user.id).maybeSingle();
      setUserCountry(prof?.country_of_origin ?? null);
    }
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
    // Discussions
    const uniId = (data.university as Uni).id;
    const { data: posts } = await supabase.from("forum_posts")
      .select("id, title, is_anonymous, user_id, created_at")
      .eq("is_removed", false).eq("tag_university_id", uniId)
      .order("created_at", { ascending: false }).limit(5);
    const pRows = posts ?? [];
    if (pRows.length === 0) { setDiscussions([]); }
    else {
      const ids = pRows.map((r) => r.id);
      const uids = Array.from(new Set(pRows.filter((r) => !r.is_anonymous).map((r) => r.user_id)));
      const [likesRes, commentsRes, profsRes] = await Promise.all([
        supabase.from("forum_likes").select("post_id").in("post_id", ids),
        supabase.from("forum_comments").select("post_id").in("post_id", ids).eq("is_removed", false),
        uids.length ? supabase.from("profiles").select("id, full_name").in("id", uids) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      ]);
      const lm = new Map<string, number>();
      (likesRes.data ?? []).forEach((l) => lm.set(l.post_id!, (lm.get(l.post_id!) ?? 0) + 1));
      const cm = new Map<string, number>();
      (commentsRes.data ?? []).forEach((c) => cm.set(c.post_id, (cm.get(c.post_id) ?? 0) + 1));
      const pm = new Map<string, string | null>();
      (profsRes.data ?? []).forEach((p) => pm.set(p.id, p.full_name));
      setDiscussions(pRows.map((r) => ({
        id: r.id, title: r.title, is_anonymous: r.is_anonymous, created_at: r.created_at,
        author_name: r.is_anonymous ? null : pm.get(r.user_id) ?? null,
        like_count: lm.get(r.id) ?? 0, comment_count: cm.get(r.id) ?? 0,
      })));
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

  const manualRefresh = async () => {
    if (!entry?.program) return;
    setAdm(null); setCp(null); setFd(null); setCity(null); setCareer(null);
    setEnriching(true);
    try {
      const { error } = await supabase.functions.invoke("enrich-university", {
        body: {
          program_id: entry.program.id,
          university_name: entry.university.name,
          program_name: entry.program.name,
          website_url: entry.university.website_url ?? "",
          force: true,
        },
      });
      if (error) throw error;
      await load();
      toast.success("Information updated successfully");
    } catch (e) {
      console.error(e);
      toast.error("Update failed — please try again");
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
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                router.history.back();
              } else {
                router.navigate({ to: "/dashboard" });
              }
            }}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to pipeline
          </button>
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="min-w-0">
              <h1 className="font-display text-3xl leading-tight">{entry.university.name}</h1>
              <p className="text-muted-foreground mt-1">{entry.program?.name}</p>
              <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
                {entry.university.qs_ranking && <span>QS #{entry.university.qs_ranking}</span>}
                {entry.university.city && <span>{entry.university.city}{entry.university.country ? `, ${entry.university.country}` : ""}</span>}
                {(entry.program?.program_url || entry.university.website_url) && (
                  <a href={entry.program?.program_url || entry.university.website_url!} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-foreground">
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
              <div className="flex flex-col items-end gap-1">
                <Button variant="outline" size="sm" onClick={manualRefresh} disabled={enriching} className="gap-1.5">
                  <RefreshCw className={`h-3.5 w-3.5 ${enriching ? "animate-spin" : ""}`} />
                  {enriching ? "Updating..." : "Update Data"}
                </Button>
                {entry.program?.last_verified_at && (
                  <span className="text-[11px] text-muted-foreground">
                    Last updated: {new Date(entry.program.last_verified_at).toLocaleDateString()}
                  </span>
                )}
              </div>
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
            <TabsTrigger value="outreach">Outreach</TabsTrigger>
            <TabsTrigger value="discussion">Discussion</TabsTrigger>
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
                <DeadlinesBlock adm={adm} applyUrl={adm?.apply_url ?? entry.program?.program_url ?? entry.university.website_url ?? null} />
                <div className="py-2 border-b border-border last:border-0">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Required materials</div>
                  {Array.isArray(adm?.required_materials) && adm!.required_materials.length ? (
                    <ul className="mt-1 text-sm list-disc list-inside space-y-0.5">
                      {(adm!.required_materials as string[]).map((m, i) => <li key={i}>{m}</li>)}
                    </ul>
                  ) : <DV />}
                </div>
                <TestRequirementRows adm={adm} />
                <Row k="Application fee" v={adm?.application_fee ? `${adm.application_fee} ${adm.application_fee_currency ?? ""}` : null} />
                {(entry.program?.program_url || entry.university.website_url) && (
                  <div className="pt-4">
                    <Button asChild variant="outline" size="sm">
                      <a href={entry.program?.program_url || entry.university.website_url!} target="_blank" rel="noreferrer">Open apply page <ExternalLink className="h-3.5 w-3.5 ml-1" /></a>
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </TabsContent>

          <TabsContent value="class" className="mt-6">
            {enriching && !cp ? <SkeletonCard /> : (
              <Card title="Class profile">
                <GreRows cp={cp} />
                <Row k="Average GMAT" v={pick(cp?.avg_gmat, cp?.avg_gmat_note)} />
                <Row k="Average GPA" v={pick(cp?.avg_gpa, cp?.avg_gpa_note)} />
                <Row k="Average IELTS" v={pick(cp?.avg_ielts, cp?.avg_ielts_note)} />
                <Row k="Average TOEFL" v={pick(cp?.avg_toefl, cp?.avg_toefl_note)} />
                <Row k="Average work experience (yrs)" v={pick(cp?.avg_work_exp_years, cp?.avg_work_exp_note)} />
                <Row k="Class size" v={cp?.class_size} />
                <Row k="% International" v={cp?.intl_pct != null ? `${cp.intl_pct}%` : (cp?.intl_student_pct_note ?? null)} />
                <Row k="STEM-designated" v={entry.program?.is_stem == null ? null : entry.program.is_stem ? "Yes" : "No"} />
              </Card>
            )}
          </TabsContent>

          <TabsContent value="funding" className="mt-6">
            {enriching && !fd ? <SkeletonCard /> : (
              <Card title="Tuition & funding">
                <Row k="Tuition" v={fd?.tuition_amount ? `${fd.tuition_amount.toLocaleString()} ${fd.tuition_currency ?? ""}` : (fd?.tuition_note ?? null)} />
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
                <Row k="Average salary" v={career?.avg_salary != null ? `${Number(career.avg_salary).toLocaleString()} ${career.avg_salary_currency ?? ""}` : (career?.avg_salary_note ?? null)} />
                <Row k="Top employers" v={Array.isArray(career?.top_employers) && (career!.top_employers as string[]).length ? (career!.top_employers as string[]).join(", ") : null} />
                <Row k="Top industries" v={Array.isArray(career?.top_industries) && (career!.top_industries as string[]).length ? (career!.top_industries as string[]).join(", ") : null} />
                <Row k="International student salary note" v={career?.intl_student_salary_note} />
                <Row k="Notes" v={career?.salary_breakdown_notes} />
              </Card>
            )}
          </TabsContent>

          <TabsContent value="outreach" className="mt-6">
            {entry.program ? (
              <OutreachTab
                programId={entry.program.id}
                universityId={entry.university.id}
                universityName={entry.university.name}
                programName={entry.program.name}
                userCountry={userCountry}
              />
            ) : (
              <div className="rounded-xl border border-border bg-surface-elevated p-6 text-sm text-muted-foreground">
                No program linked to this entry yet.
              </div>
            )}
          </TabsContent>

          <TabsContent value="discussion" className="mt-6">
            <div className="rounded-xl border border-border bg-surface-elevated p-6">
              <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
                <h3 className="font-display text-lg">Discussions about {entry.university.name}</h3>
                <Button size="sm" onClick={() => setOpenNewPost(true)}>Start a discussion about {entry.university.name}</Button>
              </div>
              {discussions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No discussions yet for this program. Start one and help future applicants.</p>
              ) : (
                <div className="space-y-2">
                  {discussions.map((d) => (
                    <Link key={d.id} to="/forum/$postId" params={{ postId: d.id }} className="block rounded-md border border-border p-3 hover:border-primary/40">
                      <div className="font-medium">{d.title}</div>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{d.is_anonymous ? "Anonymous" : (d.author_name || "Member")}</span>
                        <span>· {timeAgo(d.created_at)}</span>
                        <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {d.like_count}</span>
                        <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> {d.comment_count}</span>
                      </div>
                    </Link>
                  ))}
                  <Link to="/forum" className="block text-sm text-primary hover:underline mt-3">
                    See all discussions about {entry.university.name} →
                  </Link>
                </div>
              )}
            </div>
            <NewPostDialog
              open={openNewPost}
              onOpenChange={setOpenNewPost}
              presetUniversity={{ id: entry.university.id, name: entry.university.name }}
              onCreated={() => load()}
            />
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

function pick(value: number | string | null | undefined, note?: string | null): React.ReactNode {
  if (value != null && value !== "") return value as React.ReactNode;
  if (note && note.trim() !== "") return note;
  return null;
}

function formatGre(num: number | null | undefined, range: string | null | undefined): string | null {
  const hasNum = num != null;
  const hasRange = range != null && String(range).trim() !== "";
  if (hasNum && hasRange) return `${num} (range: ${range})`;
  if (hasNum) return String(num);
  if (hasRange) return String(range);
  return null;
}

function GreRows({ cp }: { cp: Cp | null }) {
  const c = cp as any;
  const total = formatGre(c?.gre_total, c?.gre_total_range);
  const quant = formatGre(c?.gre_quant ?? c?.avg_gre_quant, c?.gre_quant_range);
  const verbal = formatGre(c?.gre_verbal ?? c?.avg_gre_verbal, c?.gre_verbal_range);
  if (!total && !quant && !verbal) {
    return <Row k="GRE" v={null} />;
  }
  return (
    <>
      {total && <Row k="GRE Total" v={total} />}
      {quant && <Row k="GRE Quant" v={quant} />}
      {verbal && <Row k="GRE Verbal" v={verbal} />}
    </>
  );
}
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
  return _NotesEditorInner({ entryId, initial });
}

type DeadlineItem = { round?: string; deadline_date?: string | null; decision_date?: string | null; notes?: string | null; date?: string | null };

function parseDeadlineDate(s?: string | null): Date | null {
  if (!s) return null;
  const t = s.trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(t + "T00:00:00") : new Date(t);
  return isNaN(iso.getTime()) ? null : iso;
}

function DeadlineStatusBadge({ dateStr }: { dateStr?: string | null }) {
  const d = parseDeadlineDate(dateStr);
  if (!d) return null;
  const now = new Date();
  const diffDays = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">Passed</span>;
  if (diffDays <= 30) return <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">Coming up</span>;
  return null;
}

function TestStatusBadge({ status, notes }: { status: string; notes?: string | null }) {
  const s = status.toLowerCase();
  const map: Record<string, { label: string; cls: string }> = {
    required: { label: "Required", cls: "bg-red-500/15 text-red-600 dark:text-red-400" },
    optional: { label: "Optional", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400" },
    not_required: { label: "Not Required", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
    waived: { label: "Waived", cls: "bg-muted text-muted-foreground" },
  };
  const m = map[s] ?? { label: status, cls: "bg-muted text-muted-foreground" };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${m.cls}`}>
      {m.label}
      {s === "waived" && notes ? <Info className="h-3 w-3" aria-label={notes} /> : null}
    </span>
  );
}

function TestRequirementRows({ adm }: { adm: Adm | null }) {
  const gre = (adm as any)?.gre_required as string | null | undefined;
  const gmat = (adm as any)?.gmat_required as string | null | undefined;
  const notes = (adm as any)?.gre_gmat_notes as string | null | undefined;
  const legacy = (adm as any)?.gre_gmat_requirement as string | null | undefined;

  if (!gre && !gmat) {
    if (legacy) {
      return (
        <div className="py-2 border-b border-border last:border-0 flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">GRE/GMAT</div>
          <div className="text-sm">{legacy.charAt(0).toUpperCase() + legacy.slice(1)}</div>
        </div>
      );
    }
    return (
      <div className="py-2 border-b border-border last:border-0">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Test requirement</div>
        <div className="mt-1 text-sm text-muted-foreground italic">Not publicly available — check the program website directly</div>
      </div>
    );
  }

  return (
    <div className="py-2 border-b border-border last:border-0 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">GRE</div>
        {gre ? <TestStatusBadge status={gre} notes={notes} /> : <span className="text-sm text-muted-foreground">—</span>}
      </div>
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">GMAT</div>
        {gmat ? <TestStatusBadge status={gmat} notes={notes} /> : <span className="text-sm text-muted-foreground">—</span>}
      </div>
      {notes ? (
        <div className="text-xs italic text-muted-foreground flex items-start gap-1">
          <Info className="h-3 w-3 mt-0.5 shrink-0" /> <span>{notes}</span>
        </div>
      ) : null}
    </div>
  );
}

function DeadlinesBlock({ adm, applyUrl }: { adm: Adm | null; applyUrl: string | null }) {
  const [showRaw, setShowRaw] = useState(false);
  const list: DeadlineItem[] = Array.isArray(adm?.deadlines) ? (adm!.deadlines as unknown as DeadlineItem[]) : [];
  const isRolling = adm?.deadline_type === "rolling";
  const isTbd = adm?.deadline_type === "tbd" || (!adm?.deadline_type && list.length === 0);
  const rawText = (adm as unknown as { deadline_raw_text?: string | null } | null)?.deadline_raw_text ?? null;

  return (
    <div className="py-2 border-b border-border last:border-0">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">Deadlines</div>
      {isRolling && (
        <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          This program uses rolling admissions — apply earlier for better consideration.
        </div>
      )}
      {list.length > 0 ? (
        <div className="mt-2 divide-y divide-border rounded-md border border-border">
          <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-3 py-2 text-[11px] uppercase tracking-wider font-semibold text-[#6B7280] border-b border-border">
            <div />
            <div>Deadline</div>
            <div className="text-right">Decision Date</div>
          </div>
          {list.map((d, i) => {
            const dl = d.deadline_date ?? d.date ?? null;
            const parsed = parseDeadlineDate(dl);
            const passed = parsed && parsed.getTime() < Date.now();
            return (
              <div key={i} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-3 py-2 text-sm items-center">
                <div className="font-medium truncate">{d.round ?? "Application Deadline"}</div>
                <div className={passed ? "text-muted-foreground line-through" : ""}>
                  {dl ?? "—"}
                  <DeadlineStatusBadge dateStr={dl} />
                </div>
                <div className="text-right text-muted-foreground">{d.decision_date ?? "—"}</div>
                {d.notes && <div className="col-span-3 text-xs text-muted-foreground -mt-1">{d.notes}</div>}
              </div>
            );
          })}
        </div>
      ) : isTbd ? (
        <div className="mt-2 text-sm text-muted-foreground">
          Deadline information not publicly available — check the university website directly
          {applyUrl && (
            <>
              {" "}
              <a href={applyUrl} target="_blank" rel="noreferrer" className="text-primary underline">open apply page</a>.
            </>
          )}
        </div>
      ) : <DV />}

      {rawText && rawText.trim() !== "" && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {showRaw ? "Hide" : "Show"} source data
          </button>
          {showRaw && (
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-[11px] text-muted-foreground">{rawText}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function _NotesEditorInner({ entryId, initial }: { entryId: string; initial: string }) {
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