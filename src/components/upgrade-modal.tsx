import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

// Kept for backwards compatibility with existing call sites.
export type UpgradeReason = "discover" | "ai" | "contacts" | "resume" | "generic";

const FREE_FEATURES: { label: string; included: boolean }[] = [
  { label: "Dashboard", included: true },
  { label: "3 Discover runs (lifetime)", included: true },
  { label: "Discussion forum", included: true },
  { label: "Save contacts", included: true },
  { label: "Contacts CRM page", included: false },
  { label: "Resume builder", included: false },
];

const PRO_FEATURES: { label: string; included: boolean }[] = [
  { label: "Everything in Free", included: true },
  { label: "20 Discover runs / month", included: true },
  { label: "Resume builder", included: true },
  { label: "Full contacts CRM", included: true },
  { label: "50 AI resume bullets / month", included: true },
];

export function UpgradeModal({
  open, onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Legacy prop — no longer varies copy; kept so existing callers still typecheck. */
  reason?: UpgradeReason;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-center">Unlock full access</DialogTitle>
          <p className="text-center text-muted-foreground pt-2">
            Get unlimited research, resume builder, contact management, and AI assistance for $10/month.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="font-display text-lg mb-3">Free</div>
            <ul className="space-y-2 text-sm">
              {FREE_FEATURES.map((f) => (
                <li key={f.label} className="flex items-start gap-2">
                  {f.included
                    ? <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    : <X className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
                  <span className={f.included ? "" : "text-muted-foreground line-through"}>{f.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border-2 border-primary bg-primary/5 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <div className="font-display text-lg">Pro</div>
              <div className="text-sm text-muted-foreground"><span className="text-foreground text-lg font-semibold">$10</span> / mo</div>
            </div>
            <ul className="space-y-2 text-sm">
              {PRO_FEATURES.map((f) => (
                <li key={f.label} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span>{f.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-4 flex flex-col items-center gap-2">
          <Button size="lg" className="w-full sm:w-auto sm:min-w-[280px]" disabled>
            Upgrade for $10/month
          </Button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            Maybe later
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}