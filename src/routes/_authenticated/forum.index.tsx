import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, MessageSquare, Flag, Plus, Loader2, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NewPostDialog } from "@/components/forum/new-post-dialog";
import { FlagDialog } from "@/components/forum/flag-dialog";
import { UniversitySearch } from "@/components/forum/university-search";
import { timeAgo } from "@/lib/forum-utils";
import { toast } from "sonner";

type Sort = "recent" | "liked" | "discussed";

type PostRow = {
  id: string; user_id: string; title: string; body: string; tag_type: string;
  tag_university_id: string | null; is_anonymous: boolean; is_removed: boolean;
  created_at: string; edited_at: string | null;
};

type FeedItem = PostRow & {
  author_name: string | null;
  university_name: string | null;
  like_count: number;
  liked_by_me: boolean;
  comment_count: number;
  flagged_by_me: boolean;
};

export const Route = createFileRoute("/_authenticated/forum/")({
  head: () => ({ meta: [{ title: "Community Forum — The Grad Scout" }] }),
  component: ForumFeed,
});

function ForumFeed() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<Sort>("recent");
  const [uniFilter, setUniFilter] = useState<{ id: string; name: string } | null>(null);
  const [generalOnly, setGeneralOnly] = useState(false);
  const [openNew, setOpenNew] = useState(false);
  const [flagTarget, setFlagTarget] = useState<{ id: string } | null>(null);
  const [me, setMe] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    setMe(u.user?.id ?? null);
    // mark visit
    if (u.user) {
      await supabase.from("profiles").update({ last_visited_forum_at: new Date().toISOString() }).eq("id", u.user.id);
    }
    let q = supabase.from("forum_posts").select("*").eq("is_removed", false).order("created_at", { ascending: false }).limit(200);
    if (generalOnly) q = q.eq("tag_type", "general");
    else if (uniFilter) q = q.or(`tag_university_id.eq.${uniFilter.id},tag_type.eq.general`);
    const { data: posts } = await q;
    const rows = (posts ?? []) as PostRow[];
    if (rows.length === 0) { setItems([]); setLoading(false); return; }
    const postIds = rows.map((r) => r.id);
    const userIds = Array.from(new Set(rows.filter((r) => !r.is_anonymous).map((r) => r.user_id)));
    const uniIds = Array.from(new Set(rows.map((r) => r.tag_university_id).filter(Boolean) as string[]));
    const [likeCountsRes, myLikesRes, commentsRes, profilesRes, unisRes, myFlagsRes] = await Promise.all([
      Promise.resolve({
        data: rows.map((r) => ({ post_id: r.id, like_count: (r as { like_count?: number }).like_count ?? 0 })),
      }),
      u.user ? supabase.from("forum_likes").select("post_id").in("post_id", postIds).eq("user_id", u.user.id) : Promise.resolve({ data: [] as { post_id: string | null }[] }),
      supabase.from("forum_comments").select("id, post_id").in("post_id", postIds).eq("is_removed", false),
      userIds.length ? supabase.from("profiles").select("id, full_name").in("id", userIds) : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      uniIds.length ? supabase.from("universities").select("id, name").in("id", uniIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      u.user ? supabase.from("forum_flags").select("post_id").in("post_id", postIds).eq("reporter_user_id", u.user.id) : Promise.resolve({ data: [] as { post_id: string | null }[] }),
    ]);
    const likeMap = new Map<string, { count: number; mine: boolean }>();
    ((likeCountsRes.data ?? []) as { post_id: string; like_count: number }[]).forEach((l) => {
      likeMap.set(l.post_id, { count: Number(l.like_count), mine: false });
    });
    (myLikesRes.data ?? []).forEach((l) => {
      if (!l.post_id) return;
      const cur = likeMap.get(l.post_id) ?? { count: 0, mine: false };
      cur.mine = true;
      likeMap.set(l.post_id, cur);
    });
    const commentMap = new Map<string, number>();
    (commentsRes.data ?? []).forEach((c) => commentMap.set(c.post_id, (commentMap.get(c.post_id) ?? 0) + 1));
    const profileMap = new Map<string, string | null>();
    (profilesRes.data ?? []).forEach((p) => profileMap.set(p.id, p.full_name));
    const uniMap = new Map<string, string>();
    (unisRes.data ?? []).forEach((u2) => uniMap.set(u2.id, u2.name));
    const flagged = new Set((myFlagsRes.data ?? []).map((f) => f.post_id).filter(Boolean) as string[]);

    const feed: FeedItem[] = rows.map((r) => ({
      ...r,
      author_name: r.is_anonymous ? null : profileMap.get(r.user_id) ?? null,
      university_name: r.tag_university_id ? uniMap.get(r.tag_university_id) ?? null : null,
      like_count: likeMap.get(r.id)?.count ?? 0,
      liked_by_me: likeMap.get(r.id)?.mine ?? false,
      comment_count: commentMap.get(r.id) ?? 0,
      flagged_by_me: flagged.has(r.id),
    }));
    setItems(feed);
    setLoading(false);
  }, [uniFilter, generalOnly]);

  useEffect(() => { load(); }, [load]);

  const sorted = useMemo(() => {
    const arr = [...items];
    if (sort === "liked") arr.sort((a, b) => b.like_count - a.like_count || +new Date(b.created_at) - +new Date(a.created_at));
    else if (sort === "discussed") arr.sort((a, b) => b.comment_count - a.comment_count || +new Date(b.created_at) - +new Date(a.created_at));
    return arr.slice(0, 20);
  }, [items, sort]);

  const toggleLike = async (p: FeedItem) => {
    if (!me) return;
    if (p.liked_by_me) {
      setItems((prev) => prev.map((x) => x.id === p.id ? { ...x, liked_by_me: false, like_count: Math.max(0, x.like_count - 1) } : x));
      await supabase.from("forum_likes").delete().eq("user_id", me).eq("post_id", p.id);
    } else {
      setItems((prev) => prev.map((x) => x.id === p.id ? { ...x, liked_by_me: true, like_count: x.like_count + 1 } : x));
      const { error } = await supabase.from("forum_likes").insert({ user_id: me, post_id: p.id });
      if (error && error.code !== "23505") toast.error(error.message);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl">Community Forum</h1>
            <p className="text-muted-foreground mt-1">Share experiences, ask questions, and help fellow applicants.</p>
          </div>
          <Button onClick={() => setOpenNew(true)} className="w-full gap-2 sm:w-auto"><Plus className="h-4 w-4" /> New Post</Button>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="liked">Most Liked</SelectItem>
              <SelectItem value="discussed">Most Discussed</SelectItem>
            </SelectContent>
          </Select>
          <div className="w-full sm:w-[260px]">
            <UniversitySearch value={uniFilter} onChange={(u) => { setUniFilter(u); setGeneralOnly(false); }} placeholder="Filter by university…" />
          </div>
          <Button variant={generalOnly ? "default" : "outline"} size="sm" onClick={() => { setGeneralOnly((g) => !g); setUniFilter(null); }}>
            General only
          </Button>
          {(uniFilter || generalOnly) && (
            <Button variant="ghost" size="sm" onClick={() => { setUniFilter(null); setGeneralOnly(false); }} className="gap-1">
              <X className="h-3.5 w-3.5" /> Clear filter
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : sorted.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface-elevated p-10 text-center text-muted-foreground">
            No posts yet. Be the first to share your experience or ask a question.
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((p) => (
              <div key={p.id} className="rounded-xl border border-border bg-surface-elevated p-5 hover:border-primary/40 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <button className="text-left flex-1 min-w-0" onClick={() => navigate({ to: "/forum/$postId", params: { postId: p.id } })}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge variant={p.tag_type === "general" ? "secondary" : "default"}>{p.university_name ?? "General"}</Badge>
                      <span className="text-xs text-muted-foreground">{p.is_anonymous ? "Anonymous" : (p.author_name || "Member")}</span>
                      <span className="text-xs text-muted-foreground">· {timeAgo(p.created_at)}</span>
                      {p.edited_at && <span className="text-xs text-muted-foreground italic">· edited</span>}
                    </div>
                    <h3 className="font-display text-lg leading-snug">{p.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-3">
                      {p.body.slice(0, 200)}{p.body.length > 200 ? "…" : ""}
                      {p.body.length > 200 && <span className="ml-1 text-foreground underline">read more</span>}
                    </p>
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <button onClick={() => toggleLike(p)} className={`flex items-center gap-1 ${p.liked_by_me ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                    <Heart className={`h-4 w-4 ${p.liked_by_me ? "fill-current" : ""}`} /> {p.like_count}
                  </button>
                  <Link to="/forum/$postId" params={{ postId: p.id }} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                    <MessageSquare className="h-4 w-4" /> {p.comment_count}
                  </Link>
                  <button
                    disabled={p.flagged_by_me}
                    onClick={() => setFlagTarget({ id: p.id })}
                    className={`ml-auto flex items-center gap-1 text-xs ${p.flagged_by_me ? "text-muted-foreground opacity-60" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Flag className="h-3.5 w-3.5" /> {p.flagged_by_me ? "Flagged" : "Flag"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <NewPostDialog open={openNew} onOpenChange={setOpenNew} onCreated={(id) => navigate({ to: "/forum/$postId", params: { postId: id } })} />
      {flagTarget && (
        <FlagDialog
          open={!!flagTarget}
          onOpenChange={(b) => !b && setFlagTarget(null)}
          target={{ kind: "post", id: flagTarget.id }}
          onFlagged={() => { load(); }}
        />
      )}
    </AppShell>
  );
}