import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const REASONS = ["Spam", "Misinformation", "Offensive content", "Irrelevant", "Other"];

export function FlagDialog({
  open,
  onOpenChange,
  target,
  onFlagged,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  target: { kind: "post" | "comment"; id: string };
  onFlagged?: () => void;
}) {
  const [reason, setReason] = useState("Spam");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (open) { setReason("Spam"); setDetails(""); } }, [open]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const row = {
        reporter_user_id: u.user.id,
        post_id: target.kind === "post" ? target.id : null,
        comment_id: target.kind === "comment" ? target.id : null,
        reason,
        details: details.trim() || null,
      };
      const { error } = await supabase.from("forum_flags").insert(row);
      if (error) {
        if (error.code === "23505") toast.info("You've already flagged this.");
        else toast.error(error.message);
      } else {
        toast.success("Thank you — this has been flagged for review.");
        onFlagged?.();
        onOpenChange(false);
      }
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Why are you flagging this?</DialogTitle></DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
          {REASONS.map((r) => (
            <div key={r} className="flex items-center gap-2">
              <RadioGroupItem value={r} id={`fr-${r}`} />
              <Label htmlFor={`fr-${r}`} className="font-normal">{r}</Label>
            </div>
          ))}
        </RadioGroup>
        <div>
          <Label htmlFor="fd" className="mb-1 block">Additional details (optional)</Label>
          <Textarea id="fd" value={details} maxLength={300} onChange={(e) => setDetails(e.target.value)} rows={3} />
          <div className="text-xs text-muted-foreground text-right mt-1">{details.length}/300</div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>{submitting ? "Submitting…" : "Submit"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}