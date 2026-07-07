import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { UpgradeModal } from "@/components/upgrade-modal";

export function AIAssistPanel({
  open, onOpenChange, section, currentText, resumeId, onUse,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  section: string;
  currentText: string;
  resumeId: string;
  onUse: (text: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [retries, setRetries] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("resume-ai-assist", {
        body: { resume_id: resumeId, section, raw_input: currentText },
      });
      // 402 responses arrive as either an error with context or a data payload with `code`
      const code = (data as any)?.code ?? (error as any)?.context?.body?.code;
      if (code === "LIMIT_AI") { setUpgradeOpen(true); onOpenChange(false); return; }
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      setSuggestions((data as any)?.suggestions ?? []);
    } catch (e) {
      setError((e as Error).message || "Couldn't generate suggestions right now — try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  const retry = async () => {
    if (retries >= 3) { toast.error("Retry limit reached for this bullet."); return; }
    setRetries((r) => r + 1);
    await fetchSuggestions();
  };

  const accept = async (text: string) => {
    onUse(text);
    // Log accepted suggestion (best-effort)
    await supabase.from("resume_ai_suggestions" as any)
      .update({ accepted_suggestion: text })
      .eq("resume_id", resumeId)
      .eq("section", section)
      .order("created_at", { ascending: false })
      .limit(1);
    onOpenChange(false);
  };

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  };

  return (
    <>
    <UpgradeModal open={upgradeOpen} onOpenChange={setUpgradeOpen} reason="ai" />
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> AI Writing Assistant</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
            These suggestions are based only on what you've written. Review carefully before using — do not rely on AI-generated bullets without confirming the details are accurate.
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Your input:</div>
            <div className="rounded-md border p-2 text-sm bg-muted/30 min-h-[40px]">
              {currentText || <span className="italic text-muted-foreground">Write a rough version of what you did first, then use AI to strengthen it.</span>}
            </div>
          </div>
          {currentText.trim() && (
            <Button onClick={fetchSuggestions} disabled={loading} className="w-full">
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Thinking...</> : <>Get suggestions</>}
            </Button>
          )}
          {error && <div className="text-sm text-destructive">{error}</div>}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div key={i} className="rounded-md border p-3 space-y-2">
                  <div className="text-sm">{s}</div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => accept(s)} className="gap-1"><Check className="h-3 w-3" /> Use this</Button>
                    <Button size="sm" variant="outline" onClick={() => copy(s)} className="gap-1"><Copy className="h-3 w-3" /> Copy</Button>
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={retry} disabled={loading || retries >= 3} className="w-full">
                None of these — try again {retries > 0 && `(${retries}/3)`}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}