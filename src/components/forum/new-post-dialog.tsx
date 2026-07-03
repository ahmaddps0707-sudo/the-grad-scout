import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UniversitySearch } from "./university-search";
import { checkRateLimit, incrementRateLimit, POST_LIMIT_PER_HOUR } from "@/lib/forum-utils";

export function NewPostDialog({
  open,
  onOpenChange,
  onCreated,
  presetUniversity,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onCreated?: (postId: string) => void;
  presetUniversity?: { id: string; name: string } | null;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<"general" | "university">(presetUniversity ? "university" : "general");
  const [uni, setUni] = useState<{ id: string; name: string } | null>(presetUniversity ?? null);
  const [anon, setAnon] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rateBlocked, setRateBlocked] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(""); setBody(""); setAnon(false);
    setMode(presetUniversity ? "university" : "general");
    setUni(presetUniversity ?? null);
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const rl = await checkRateLimit(u.user.id, "post");
      setRateBlocked(!rl.allowed);
    })();
  }, [open, presetUniversity]);

  const titleLen = title.length;
  const bodyLen = body.length;
  const canSubmit =
    !submitting &&
    !rateBlocked &&
    title.trim().length > 0 &&
    titleLen <= 150 &&
    bodyLen >= 20 &&
    bodyLen <= 5000 &&
    (mode === "general" || !!uni);

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { toast.error("Sign in required"); return; }
      const rl = await checkRateLimit(u.user.id, "post");
      if (!rl.allowed) {
        setRateBlocked(true);
        toast.error(`You've posted ${POST_LIMIT_PER_HOUR} times in the last hour. Please wait.`);
        return;
      }
      const { data, error } = await supabase.from("forum_posts").insert({
        user_id: u.user.id,
        title: title.trim(),
        body: body.trim(),
        tag_type: mode,
        tag_university_id: mode === "university" ? uni!.id : null,
        is_anonymous: anon,
      }).select("id").single();
      if (error) { toast.error(error.message); return; }
      await incrementRateLimit(u.user.id, "post");
      toast.success("Post published successfully");
      onOpenChange(false);
      onCreated?.(data.id);
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Post</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Title</Label>
              <span className={`text-xs ${titleLen > 150 ? "text-destructive" : "text-muted-foreground"}`}>{titleLen}/150</span>
            </div>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What's on your mind?" maxLength={200} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label>Body</Label>
              <span className={`text-xs ${bodyLen > 5000 || (bodyLen > 0 && bodyLen < 20) ? "text-destructive" : "text-muted-foreground"}`}>{bodyLen}/5000</span>
            </div>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Share your experience or ask a question…" />
            {bodyLen > 0 && bodyLen < 20 && <p className="text-xs text-destructive mt-1">At least 20 characters</p>}
          </div>
          <div>
            <Label className="mb-2 block">Tag</Label>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as "general" | "university")} className="flex gap-4 mb-2">
              <div className="flex items-center gap-2"><RadioGroupItem value="general" id="tg-gen" /><Label htmlFor="tg-gen" className="font-normal">General</Label></div>
              <div className="flex items-center gap-2"><RadioGroupItem value="university" id="tg-uni" /><Label htmlFor="tg-uni" className="font-normal">Tag a University</Label></div>
            </RadioGroup>
            {mode === "university" && <UniversitySearch value={uni} onChange={setUni} />}
          </div>
          <div className="flex items-start gap-3 rounded-md border border-border bg-secondary/40 p-3">
            <Switch id="anon" checked={anon} onCheckedChange={setAnon} />
            <div className="flex-1">
              <Label htmlFor="anon" className="font-medium">Post anonymously</Label>
              {anon && (
                <p className="text-xs text-muted-foreground mt-1">
                  Your name will not be shown on this post. Your account is still linked for moderation purposes.
                </p>
              )}
            </div>
          </div>
          {rateBlocked && (
            <p className="text-sm text-destructive">
              You've posted {POST_LIMIT_PER_HOUR} times in the last hour. Please wait before posting again.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>{submitting ? "Publishing…" : "Publish"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}