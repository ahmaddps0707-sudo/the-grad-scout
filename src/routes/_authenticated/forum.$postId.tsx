import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Heart, Flag, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FlagDialog } from "@/components/forum/flag-dialog";
import { timeAgo, checkRateLimit, incrementRateLimit, COMMENT_LIMIT_PER_HOUR } from "@/lib/forum-utils";

type PostRow = {
  id: string; user_id: string; title: string; body: string; tag_type: string;
  tag_university_id: string | null; is_anonymous: boolean; is_removed: boolean;
  created_at: string; edited_at: string | null;
};
type CommentRow = {
  id: string; post_id: string; user_id: string; body: string;
  is_anonymous: boolean; is_removed: boolean;
  created_at: string; edited_at: string | null;
};

export const Route = createFileRoute("/_authenticated/forum/$postId")({
  head: () => ({
    meta: [
      { title: "Discussion — The Grad Scout" },
      { name: "description", content: "Read and join this discussion in The Grad Scout applicant community forum." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PostThread,
});

function PostThread() {
  const { postId } = Route.useParams();
  const navigate = useNavigate();
  const [me, setMe] = useState<string | null>(null);
  const [post, setPost] = useState<PostRow | null>(null);
  const [uniName, setUniName] = useState<string | null>(null);
  const [postAuthor, setPostAuthor] = useState<string | null>(null);
  const [postLikes, setPostLikes] = useState(0);
  const [postLikedByMe, setPostLikedByMe] = useState(false);
  const [postFlaggedByMe, setPostFlaggedByMe] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentAuthors, setCommentAuthors] = useState<Record<string, string | null>>({});
  const [commentLikes, setCommentLikes] = useState<Record<string, { count: number; mine: boolean }>>({});
  const [commentFlags, setCommentFlags] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const [newComment, setNewComment] = useState("");
  const [newAnon, setNewAnon] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [commentBlocked, setCommentBlocked] = useState(false);

  const [editingPost, setEditingPost] = useState(false);
  const [editPostBody, setEditPostBody] = useState("");
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editCommentBody, setEditCommentBody] = useState("");

  const [flagTarget, setFlagTarget] = useState<{ kind: "post" | "comment"; id: string } | null>(null);
  const [confirmDeletePost, setConfirmDeletePost] = useState(false);
  const [confirmDeleteComment, setConfirmDeleteComment] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    setMe(u.user?.id ?? null);
    const { data: p } = await supabase.from("forum_posts").select("*").eq("id", postId).maybeSingle();
    if (!p) { setLoading(false); return; }
    setPost(p as PostRow);
    if (p.tag_university_id) {
      const { data: uni } = await supabase.from("universities").select("name").eq("id", p.tag_university_id).maybeSingle();
      setUniName(uni?.name ?? null);
    } else setUniName(null);
    if (!p.is_anonymous) {
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", p.user_id).maybeSingle();
      setPostAuthor(prof?.full_name ?? null);
    } else setPostAuthor(null);

    const { data: cs } = await supabase.from("forum_comments").select("*").eq("post_id", postId).order("created_at", { ascending: true });
    const rows = (cs ?? []) as CommentRow[];
    setComments(rows);

    const uids = Array.from(new Set(rows.filter((r) => !r.is_anonymous).map((r) => r.user_id)));
    if (uids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", uids);
      const map: Record<string, string | null> = {};
      (profs ?? []).forEach((pp) => { map[pp.id] = pp.full_name; });
      setCommentAuthors(map);
    } else setCommentAuthors({});

    const [pLikes, cLikes, myLikes, myFlagsPost, myFlagsC] = await Promise.all([
      supabase.from("forum_posts").select("id, like_count").eq("id", postId),
      Promise.resolve({
        data: rows.map((r) => ({ comment_id: r.id, like_count: (r as { like_count?: number }).like_count ?? 0 })),
      }),
      u.user ? supabase.from("forum_likes").select("post_id, comment_id").eq("user_id", u.user.id) : Promise.resolve({ data: [] as { post_id: string | null; comment_id: string | null }[] }),
      u.user ? supabase.from("forum_flags").select("id").eq("post_id", postId).eq("reporter_user_id", u.user.id).maybeSingle() : Promise.resolve({ data: null }),
      u.user && rows.length ? supabase.from("forum_flags").select("comment_id").in("comment_id", rows.map((r) => r.id)).eq("reporter_user_id", u.user.id) : Promise.resolve({ data: [] as { comment_id: string | null }[] }),
    ]);
    const myLikeRows = (myLikes.data ?? []) as { post_id: string | null; comment_id: string | null }[];
    const postCounts = (pLikes.data ?? []) as unknown as { like_count: number }[];
    setPostLikes(Number(postCounts[0]?.like_count ?? 0));
    setPostLikedByMe(myLikeRows.some((l) => l.post_id === postId));
    setPostFlaggedByMe(!!myFlagsPost.data);
    const cMap: Record<string, { count: number; mine: boolean }> = {};
    ((cLikes.data ?? []) as { comment_id: string; like_count: number }[]).forEach((l) => {
      cMap[l.comment_id] = { count: Number(l.like_count), mine: false };
    });
    myLikeRows.forEach((l) => {
      if (!l.comment_id) return;
      const cur = cMap[l.comment_id] ?? { count: 0, mine: false };
      cur.mine = true;
      cMap[l.comment_id] = cur;
    });
    setCommentLikes(cMap);
    setCommentFlags(new Set((myFlagsC.data ?? []).map((f) => f.comment_id).filter(Boolean) as string[]));

    if (u.user) {
      const rl = await checkRateLimit(u.user.id, "comment");
      setCommentBlocked(!rl.allowed);
    }
    setLoading(false);
  }, [postId]);

  useEffect(() => { load(); }, [load]);

  const togglePostLike = async () => {
    if (!me || !post) return;
    if (postLikedByMe) {
      setPostLikedByMe(false); setPostLikes((n) => Math.max(0, n - 1));
      await supabase.from("forum_likes").delete().eq("user_id", me).eq("post_id", post.id);
    } else {
      setPostLikedByMe(true); setPostLikes((n) => n + 1);
      const { error } = await supabase.from("forum_likes").insert({ user_id: me, post_id: post.id });
      if (error && error.code !== "23505") toast.error(error.message);
    }
  };

  const toggleCommentLike = async (cid: string) => {
    if (!me) return;
    const cur = commentLikes[cid] ?? { count: 0, mine: false };
    if (cur.mine) {
      setCommentLikes({ ...commentLikes, [cid]: { count: Math.max(0, cur.count - 1), mine: false } });
      await supabase.from("forum_likes").delete().eq("user_id", me).eq("comment_id", cid);
    } else {
      setCommentLikes({ ...commentLikes, [cid]: { count: cur.count + 1, mine: true } });
      const { error } = await supabase.from("forum_likes").insert({ user_id: me, comment_id: cid });
      if (error && error.code !== "23505") toast.error(error.message);
    }
  };

  const submitComment = async () => {
    if (!me || !post) return;
    if (newComment.trim().length < 5 || newComment.trim().length > 2000) return;
    setPostingComment(true);
    try {
      const rl = await checkRateLimit(me, "comment");
      if (!rl.allowed) { setCommentBlocked(true); toast.error("You've commented too frequently. Please wait."); return; }
      const { error } = await supabase.from("forum_comments").insert({
        post_id: post.id, user_id: me, body: newComment.trim(), is_anonymous: newAnon,
      });
      if (error) { toast.error(error.message); return; }
      await incrementRateLimit(me, "comment");
      setNewComment(""); setNewAnon(false);
      load();
    } finally { setPostingComment(false); }
  };

  const savePostEdit = async () => {
    if (!post) return;
    const body = editPostBody.trim();
    if (body.length < 20 || body.length > 5000) { toast.error("Body must be 20-5000 chars"); return; }
    const { error } = await supabase.from("forum_posts").update({ body, edited_at: new Date().toISOString() }).eq("id", post.id);
    if (error) { toast.error(error.message); return; }
    setEditingPost(false); load();
  };

  const saveCommentEdit = async (cid: string) => {
    const body = editCommentBody.trim();
    if (body.length < 5 || body.length > 2000) { toast.error("Comment must be 5-2000 chars"); return; }
    const { error } = await supabase.from("forum_comments").update({ body, edited_at: new Date().toISOString() }).eq("id", cid);
    if (error) { toast.error(error.message); return; }
    setEditingComment(null); load();
  };

  const deletePost = async () => {
    if (!post) return;
    const { error } = await supabase.from("forum_posts").update({ is_removed: true }).eq("id", post.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Post deleted"); navigate({ to: "/forum" });
  };

  const deleteComment = async (cid: string) => {
    const { error } = await supabase.from("forum_comments").update({ is_removed: true }).eq("id", cid);
    if (error) { toast.error(error.message); return; }
    load();
  };

  if (loading) return <AppShell><div className="mx-auto max-w-3xl p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div></AppShell>;
  if (!post) return <AppShell><div className="mx-auto max-w-3xl p-8">Post not found.</div></AppShell>;

  const visibleCount = comments.filter((c) => !c.is_removed).length;
  const isPostAuthor = me && post.user_id === me;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <Link to="/forum" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to forum
        </Link>

        <div className="rounded-xl border border-border bg-surface-elevated p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant={post.tag_type === "general" ? "secondary" : "default"}>{uniName ?? "General"}</Badge>
            <span className="text-xs text-muted-foreground">{post.is_anonymous ? "Anonymous" : (postAuthor || "Member")}</span>
            <span className="text-xs text-muted-foreground">· {timeAgo(post.created_at)}</span>
            {post.edited_at && <span className="text-xs text-muted-foreground italic">· edited</span>}
          </div>
          {post.is_removed ? (
            <p className="italic text-muted-foreground">[This post has been removed]</p>
          ) : (
            <>
              <h1 className="mb-3 break-words font-display text-xl leading-tight sm:text-2xl">{post.title}</h1>
              {editingPost ? (
                <div className="space-y-2">
                  <Textarea value={editPostBody} onChange={(e) => setEditPostBody(e.target.value)} rows={6} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={savePostEdit}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingPost(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{post.body}</p>
              )}
            </>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <button onClick={togglePostLike} className={`flex items-center gap-1 ${postLikedByMe ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
              <Heart className={`h-4 w-4 ${postLikedByMe ? "fill-current" : ""}`} /> {postLikes}
            </button>
            {!post.is_removed && (
              <button disabled={postFlaggedByMe} onClick={() => setFlagTarget({ kind: "post", id: post.id })}
                className={`flex items-center gap-1 text-xs ${postFlaggedByMe ? "text-muted-foreground opacity-60" : "text-muted-foreground hover:text-foreground"}`}>
                <Flag className="h-3.5 w-3.5" /> {postFlaggedByMe ? "Flagged" : "Flag"}
              </button>
            )}
            {isPostAuthor && !post.is_removed && !editingPost && (
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setEditingPost(true); setEditPostBody(post.body); }}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDeletePost(true)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              </div>
            )}
          </div>
        </div>

        <h2 className="font-display text-lg mt-8 mb-3">{visibleCount} Comment{visibleCount === 1 ? "" : "s"}</h2>
        <div className="space-y-3">
          {comments.map((c) => {
            const isAuthor = me && c.user_id === me;
            const likes = commentLikes[c.id] ?? { count: 0, mine: false };
            const flagged = commentFlags.has(c.id);
            return (
              <div key={c.id} className="rounded-lg border border-border bg-surface-elevated p-4">
                <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
                  <span>{c.is_anonymous ? "Anonymous" : (commentAuthors[c.user_id] || "Member")}</span>
                  <span>· {timeAgo(c.created_at)}</span>
                  {c.edited_at && <span className="italic">· edited</span>}
                </div>
                {c.is_removed ? (
                  <p className="italic text-muted-foreground text-sm">[This comment has been removed]</p>
                ) : editingComment === c.id ? (
                  <div className="space-y-2">
                    <Textarea value={editCommentBody} onChange={(e) => setEditCommentBody(e.target.value)} rows={4} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveCommentEdit(c.id)}>Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingComment(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                )}
                {!c.is_removed && (
                  <div className="mt-2 flex items-center gap-3 text-sm">
                    <button onClick={() => toggleCommentLike(c.id)} className={`flex items-center gap-1 ${likes.mine ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}>
                      <Heart className={`h-3.5 w-3.5 ${likes.mine ? "fill-current" : ""}`} /> {likes.count}
                    </button>
                    <button disabled={flagged} onClick={() => setFlagTarget({ kind: "comment", id: c.id })}
                      className={`flex items-center gap-1 text-xs ${flagged ? "text-muted-foreground opacity-60" : "text-muted-foreground hover:text-foreground"}`}>
                      <Flag className="h-3.5 w-3.5" /> {flagged ? "Flagged" : "Flag"}
                    </button>
                    {isAuthor && editingComment !== c.id && (
                      <div className="ml-auto flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingComment(c.id); setEditCommentBody(c.body); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteComment(c.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6 scroll-mb-24 rounded-lg border border-border bg-surface-elevated p-4">
          <Label className="mb-1 block">Add a comment</Label>
          <Textarea
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onFocus={(e) => { setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 250); }}
            rows={3}
            placeholder="Share your thoughts…"
          />
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Checkbox id="c-anon" checked={newAnon} onCheckedChange={(v) => setNewAnon(!!v)} />
              <Label htmlFor="c-anon" className="font-normal text-sm">Post anonymously</Label>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{newComment.length}/2000</span>
              <Button
                size="sm"
                onClick={submitComment}
                disabled={postingComment || commentBlocked || newComment.trim().length < 5 || newComment.trim().length > 2000}
              >
                {postingComment ? "Posting…" : "Add Comment"}
              </Button>
            </div>
          </div>
          {commentBlocked && (
            <p className="text-xs text-destructive mt-2">
              You've commented too frequently. Please wait. (Limit: {COMMENT_LIMIT_PER_HOUR}/hour)
            </p>
          )}
        </div>
      </div>

      {flagTarget && (
        <FlagDialog
          open={!!flagTarget}
          onOpenChange={(b) => !b && setFlagTarget(null)}
          target={flagTarget}
          onFlagged={() => load()}
        />
      )}

      <AlertDialog open={confirmDeletePost} onOpenChange={setConfirmDeletePost}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this post?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deletePost}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDeleteComment} onOpenChange={(b) => !b && setConfirmDeleteComment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (confirmDeleteComment) { deleteComment(confirmDeleteComment); setConfirmDeleteComment(null); } }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}