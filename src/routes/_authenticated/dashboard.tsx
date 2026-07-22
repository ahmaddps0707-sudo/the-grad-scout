import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Heart, ThumbsDown, ThumbsUp, Star, Plus, Sparkles, ExternalLink, Loader2, MapPin, AlertCircle, Trash2 } from "lucide-react";
import { STATUS_LABELS, STATUS_ORDER, type EntryStatus } from "@/lib/status";
import { scoreColorClass } from "@/lib/scoring";
import { FREE_LIMITS, PAID_LIMITS, isPaidTier } from "@/lib/limits";
import { UpgradeModal, type UpgradeReason } from "@/components/upgrade-modal";
import { deleteUserEntry } from "@/utils/entries.functions";
import type { Database } from "@/integrations/supabase/types";

type EntryRow = Database["public"]["Tables"]["user_entries"]["Row"];
type Uni = Database["public"]["Tables"]["universities"]["Row"];
type Prog = Database["public"]["Tables"]["programs"]["Row"];

interface EntryFull extends EntryRow {
  university: Uni;
  program: Prog | null;
}

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Admitly" }] }),
  validateSearch: (search: Record<string, unknown>) => {
    const quick = (search.quick as string) ?? "all";
    const status = (search.status as string) ?? "all";
    const sort = (search.sort as string) ?? "score";
    const allowedQuick = ["all","favorites","liked","applied","offers"];
    const allowedSort = ["score","qs","updated","deadline"];
    return {
      quick: (allowedQuick.includes(quick) ? quick : "all") as "all"|"favorites"|"liked"|"applied"|"offers",
      status: status as string,
      sort: (allowedSort.includes(sort) ? sort : "score") as "score"|"qs"|"updated"|"deadline",
    };
  },
  component: DashboardPage,
});

type QuickFilter = "all" | "favorites" | "liked" | "applied" | "offers";
type SortKey = "score" | "qs" | "updated" | "deadline";

function DashboardPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const quick = search.quick;
  const statusFilter = search.status as EntryStatus | "all";
  const sort = search.sort;
  const setSearch = (patch: Partial<typeof search>) =>
    navigate({ to: "/dashboard", search: (prev: typeof search) => ({ ...prev, ...patch }) });
  const [entries, setEntries] = useState<EntryFull[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);
  const [tier, setTier] = useState<{ tier: "free" | "paid"; status: "active" | "canceled" | "past_due" | null; discover_runs_used: number }>({ tier: "free", status: null, discover_runs_used: 0 });
  const [lastRunCount, setLastRunCount] = useState<number | null>(null);
  const preRunCountRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: prof } = await supabase.from("profiles").select("subscription_tier,subscription_status,discover_runs_used").eq("id", u.user.id).single();
    if (prof) setTier({ tier: (prof as any).subscription_tier, status: (prof as any).subscription_status, discover_runs_used: (prof as any).discover_runs_used ?? 0 });
    const { data, error } = await supabase
      .from("user_entries")
      .select("*, university:universities(*), program:programs(*)")
      .eq("user_id", u.user.id)
      .order("score", { ascending: false, nullsFirst: false });
    if (error) { toast.error(error.message); return; }
    setEntries((data ?? []) as unknown as EntryFull[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Pick up in-flight job from query string or look up a recent pending one
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobFromUrl = params.get("job");
    if (jobFromUrl) { setActiveJobId(jobFromUrl); setDiscovering(true); return; }
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data } = await supabase.from("discover_jobs")
        .select("*").eq("user_id", u.user.id)
        .in("status", ["pending","running"])
        .order("requested_at", { ascending: false }).limit(1).maybeSingle();
      if (data) { setActiveJobId(data.id); setDiscovering(true); }
    })();
  }, []);

  // Poll the active job
  useEffect(() => {
    if (!activeJobId) return;
    // Snapshot pre-run count for jobs we didn't start ourselves (post-onboarding)
    if (preRunCountRef.current == null) preRunCountRef.current = entries.length;
    const interval = setInterval(async () => {
      const { data } = await supabase.from("discover_jobs").select("status,error").eq("id", activeJobId).single();
      if (!data) return;
      if (data.status === "done") {
        clearInterval(interval);
        setDiscovering(false);
        setActiveJobId(null);
        const before = preRunCountRef.current;
        await load();
        const { data: u2 } = await supabase.auth.getUser();
        let added = 0;
        if (u2.user) {
          const { count } = await supabase.from("user_entries")
            .select("*", { count: "exact", head: true }).eq("user_id", u2.user.id);
          if (before != null && count != null) added = Math.max(0, count - before);
        }
        setLastRunCount(added);
        preRunCountRef.current = null;
        toast.success(added > 0 ? `${added} new ${added === 1 ? "match" : "matches"} added` : "Discovery complete");
      } else if (data.status === "failed") {
        clearInterval(interval);
        setDiscovering(false);
        setActiveJobId(null);
        toast.error(data.error ?? "Discovery failed");
      }
    }, 1800);
    return () => clearInterval(interval);
  }, [activeJobId, load]);

  const discoverMore = async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    // Client-side pre-check
    const paid = isPaidTier(tier);
    const limit = paid ? PAID_LIMITS.discover_runs : FREE_LIMITS.discover_runs;
    if (tier.discover_runs_used >= limit) {
      if (!paid) { setUpgradeReason("discover"); return; }
      toast.error(`You've reached ${PAID_LIMITS.discover_runs} discover runs for this billing period.`);
      return;
    }
    preRunCountRef.current = entries.length;
    setLastRunCount(null);
    const { data: job, error } = await supabase.from("discover_jobs").insert({ user_id: u.user.id, status: "pending" }).select().single();
    if (error) return toast.error(error.message);
    setActiveJobId(job.id);
    setDiscovering(true);
    supabase.functions.invoke("discover-universities", { body: { job_id: job.id } }).catch((e) => console.error(e));
  };

  const filtered = useMemo(() => {
    let arr = entries.filter((e) => !e.is_archived || statusFilter === "archived");
    if (quick === "favorites") arr = arr.filter((e) => e.is_favorite);
    else if (quick === "liked") arr = arr.filter((e) => e.is_liked);
    else if (quick === "applied") arr = arr.filter((e) => ["applied","in_progress","interview"].includes(e.status));
    else if (quick === "offers") arr = arr.filter((e) => e.status === "offer");
    if (statusFilter !== "all") arr = arr.filter((e) => e.status === statusFilter);
    arr = [...arr].sort((a, b) => {
      if (sort === "score") return (b.score ?? 0) - (a.score ?? 0);
      if (sort === "qs") return (a.university.qs_ranking ?? 9999) - (b.university.qs_ranking ?? 9999);
      if (sort === "updated") return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      return 0;
    });
    return arr;
  }, [entries, quick, statusFilter, sort]);

  const updateEntry = async (id: string, patch: Partial<EntryRow>) => {
    const prev = entries.find((e) => e.id === id);
    setEntries((es) => es.map((e) => e.id === id ? { ...e, ...patch } as EntryFull : e));
    const { error } = await supabase.from("user_entries").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      if (prev) setEntries((es) => es.map((e) => e.id === id ? prev : e));
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-6 py-8">
        <UpgradeModal open={!!upgradeReason} onOpenChange={(v) => !v && setUpgradeReason(null)} reason={upgradeReason ?? "generic"} />
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="font-display text-3xl">Your pipeline</h1>
            <p className="text-sm text-muted-foreground mt-1">{entries.length} {entries.length === 1 ? "program" : "programs"} tracked</p>
          </div>
          <div className="flex items-center gap-2">
            <AddUniversityDialog onAdded={load} />
            <Button onClick={discoverMore} disabled={discovering} className="gap-2">
              {discovering ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {discovering ? "Researching…" : "Discover more"}
            </Button>
          </div>
        </div>

        {discovering && entries.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <h2 className="mt-4 font-display text-xl">Researching your matches…</h2>
            <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
              We're scanning current university sources for five programs that fit your profile. This usually takes 20–60 seconds.
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {(["all","favorites","liked","applied","offers"] as QuickFilter[]).map((q) => (
                <button key={q} onClick={() => setSearch({ quick: q })} className={`rounded-full px-4 py-1.5 text-sm transition-colors border ${quick === q ? "bg-primary text-primary-foreground border-primary" : "bg-surface border-border text-muted-foreground hover:text-foreground"}`}>
                  {q === "all" ? "All" : q[0].toUpperCase() + q.slice(1)}
                </button>
              ))}
              <div className="ml-auto flex items-center gap-2">
                <Select value={statusFilter} onValueChange={(v) => setSearch({ status: v })}>
                  <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={sort} onValueChange={(v) => setSearch({ sort: v as SortKey })}>
                  <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="score">Sort: Score</SelectItem>
                    <SelectItem value="qs">Sort: QS Rank</SelectItem>
                    <SelectItem value="updated">Sort: Recently updated</SelectItem>
                    <SelectItem value="deadline">Sort: Deadline</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {lastRunCount !== null && lastRunCount <= 2 && lastRunCount > 0 && (
              <LowResultsBanner count={lastRunCount} onDismiss={() => setLastRunCount(null)} />
            )}
            {loading ? (
              <div className="text-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" /></div>
            ) : filtered.length === 0 ? (
              lastRunCount === 0 ? <LowResultsBanner count={0} onDismiss={() => setLastRunCount(null)} /> : <EmptyState onDiscover={discoverMore} />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filtered.map((e) => (
                  <EntryCard key={e.id} entry={e} onUpdate={(p) => updateEntry(e.id, p)} onOpen={() => navigate({ to: "/university/$id", params: { id: e.id } })} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function LowResultsBanner({ count, onDismiss }: { count: number; onDismiss: () => void }) {
  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5 p-5 flex items-start gap-3">
      <AlertCircle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm text-foreground">
          We found {count} {count === 1 ? "program" : "programs"} matching your current criteria. Your filters may be too specific — try broadening your tier preference or funding requirements in Settings to unlock more matches.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Button asChild size="sm"><Link to="/settings">Update preferences</Link></Button>
          <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ onDiscover }: { onDiscover: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center">
      <h2 className="font-display text-xl">No programs yet</h2>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">Add a university manually or let Admitly research five matches based on your profile.</p>
      <Button onClick={onDiscover} className="mt-6 gap-2"><Sparkles className="h-4 w-4" /> Research matches</Button>
    </div>
  );
}

function EntryCard({ entry, onUpdate, onOpen }: { entry: EntryFull; onUpdate: (p: Partial<EntryRow>) => void; onOpen: () => void }) {
  const score = entry.score ?? 0;
  return (
    <div className="group rounded-xl border border-border bg-surface-elevated p-5 hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 cursor-pointer" onClick={onOpen}>
          <div className="font-display text-lg leading-tight text-foreground truncate">{entry.university.name}</div>
          <div className="text-sm text-muted-foreground mt-0.5 truncate">{entry.program?.name ?? "—"}</div>
        </div>
        <div className={`shrink-0 rounded-full border px-3 py-1 text-sm font-medium ${scoreColorClass(score)}`}>{score}</div>
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
        {entry.university.qs_ranking && <span>QS #{entry.university.qs_ranking}</span>}
        {entry.program?.us_news_ranking != null && <span>US News #{entry.program.us_news_ranking}</span>}
        {entry.program?.school_ranking != null && <span>School #{entry.program.school_ranking}</span>}
        {entry.university.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{entry.university.city}{entry.university.country ? `, ${entry.university.country}` : ""}</span>}
        {entry.university.website_url && (
          <a href={entry.university.website_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 hover:text-foreground">
            <ExternalLink className="h-3 w-3" /> site
          </a>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <IconBtn active={entry.is_favorite} onClick={() => onUpdate({ is_favorite: !entry.is_favorite })} label="Favorite"><Star className="h-4 w-4" fill={entry.is_favorite ? "currentColor" : "none"} /></IconBtn>
          <IconBtn active={entry.is_liked} onClick={() => onUpdate({ is_liked: !entry.is_liked, is_disliked: false })} label="Like"><ThumbsUp className="h-4 w-4" /></IconBtn>
          <IconBtn active={entry.is_disliked} onClick={() => onUpdate({ is_disliked: !entry.is_disliked, is_liked: false })} label="Dislike"><ThumbsDown className="h-4 w-4" /></IconBtn>
        </div>
        <Select value={entry.status} onValueChange={(v) => onUpdate({ status: v as EntryStatus })}>
          <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, active, label }: { children: React.ReactNode; onClick: () => void; active?: boolean; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} className={`p-2 rounded-md transition-colors ${active ? "text-accent" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}>
      {children}
    </button>
  );
}

function AddUniversityDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [uni, setUni] = useState("");
  const [prog, setProg] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uni.trim() || !prog.trim()) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const { data: existingUni } = await supabase.from("universities")
        .select("*").ilike("name", uni.trim()).maybeSingle();
      let uniId = existingUni?.id;
      if (!uniId) {
        const { data: newUni, error: ue } = await supabase.from("universities")
          .insert({ name: uni.trim(), website_url: url || null }).select().single();
        if (ue) throw ue;
        uniId = newUni.id;
      }
      const { data: existingProg } = await supabase.from("programs")
        .select("*").eq("university_id", uniId).ilike("name", prog.trim()).maybeSingle();
      let progId = existingProg?.id;
      if (!progId) {
        const { data: newProg, error: pe } = await supabase.from("programs")
          .insert({ university_id: uniId, name: prog.trim(), degree_level: "masters" }).select().single();
        if (pe) throw pe;
        progId = newProg.id;
      }
      const { error: ee } = await supabase.from("user_entries")
        .insert({ user_id: u.user.id, university_id: uniId, program_id: progId, status: "planning", source: "manual", score: 50 });
      if (ee && !ee.message.includes("duplicate")) throw ee;
      toast.success("Added");
      setOpen(false); setUni(""); setProg(""); setUrl("");
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" /> Add University</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add a university manually</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div><Label>University name</Label><Input value={uni} onChange={(e) => setUni(e.target.value)} required className="mt-1.5" /></div>
          <div><Label>Program name</Label><Input value={prog} onChange={(e) => setProg(e.target.value)} required className="mt-1.5" /></div>
          <div><Label>Website URL</Label><Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" className="mt-1.5" /></div>
          <DialogFooter><Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add to pipeline"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}