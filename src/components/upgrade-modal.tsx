import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, Check } from "lucide-react";

export type UpgradeReason = "discover" | "ai" | "tracked" | "generic";

const COPY: Record<UpgradeReason, { title: string; body: string }> = {
  discover: {
    title: "You've used all 3 free discover runs this month",
    body: "Upgrade to Admitly Pro for unlimited AI discovery, unlimited tracked programs, and unlimited resume AI assistance.",
  },
  ai: {
    title: "You've used all 10 free AI bullet suggestions this month",
    body: "Upgrade to Admitly Pro for unlimited AI writing assistance on your resume.",
  },
  tracked: {
    title: "You've reached the 25 tracked programs cap",
    body: "Upgrade to Admitly Pro to track unlimited programs across your pipeline.",
  },
  generic: {
    title: "Upgrade to Admitly Pro",
    body: "Unlock unlimited discovery, tracked programs, and AI assistance.",
  },
};

export function UpgradeModal({
  open, onOpenChange, reason = "generic",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reason?: UpgradeReason;
}) {
  const { title, body } = COPY[reason];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Sparkles className="h-5 w-5 text-primary" /> {title}
          </DialogTitle>
          <DialogDescription className="pt-2">{body}</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-display text-lg">Admitly Pro</div>
            <div className="text-sm text-muted-foreground"><span className="text-foreground text-lg font-semibold">$10</span> / mo</div>
          </div>
          <ul className="text-sm text-muted-foreground space-y-1.5">
            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Unlimited AI discovery runs</li>
            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Unlimited tracked programs</li>
            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Unlimited resume AI bullets</li>
            <li className="flex items-center gap-2"><Check className="h-4 w-4 text-primary" /> Priority research quality</li>
          </ul>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Not now</Button>
          <Button disabled className="gap-2"><Sparkles className="h-4 w-4" /> Payments coming soon</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}