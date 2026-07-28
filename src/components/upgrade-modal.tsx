import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Check, X, Loader2, AlertCircle } from "lucide-react";
import { StripeEmbeddedCheckout } from "@/components/stripe-embedded-checkout";
import { createCheckoutSession } from "@/utils/payments.functions";
import { getStripeEnvironment } from "@/lib/stripe";

// Kept for backwards compatibility with existing call sites.
export type UpgradeReason = "discover" | "ai" | "contacts" | "resume" | "generic";

const FREE_FEATURES: { label: string; included: boolean }[] = [
  { label: "Dashboard", included: true },
  { label: "3 Discover runs", included: true },
  { label: "Discussion forum", included: true },
  { label: "Save contacts", included: true },
  { label: "Contacts CRM page", included: false },
  { label: "Resume builder", included: false },
];

const PRO_FEATURES: { label: string; included: boolean }[] = [
  { label: "Everything in Free", included: true },
  { label: "20 Discover runs (upto 100 programs)", included: true },
  { label: "Resume builder", included: true },
  { label: "Full contacts CRM", included: true },
  { label: "50 AI resume bullets", included: true },
];

export function UpgradeModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Legacy prop — no longer varies copy; kept so existing callers still typecheck. */
  reason?: UpgradeReason;
}) {
  const [promoCode, setPromoCode] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = (v: boolean) => {
    if (!v) {
      setClientSecret(null);
      setError(null);
      setLoading(false);
      setPromoCode("");
    }
    onOpenChange(v);
  };

  const startCheckout = async () => {
    setError(null);
    setLoading(true);
    try {
      const result = await createCheckoutSession({
        data: {
          priceId: "pro_monthly",
          returnUrl: `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
          environment: getStripeEnvironment(),
          trialDays: 7,
          promoCode: promoCode.trim() || undefined,
        },
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      if (!result.clientSecret) {
        setError("Stripe did not return a client secret");
        return;
      }
      setClientSecret(result.clientSecret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start checkout");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-center">Unlock full access</DialogTitle>
          <p className="text-center text-muted-foreground pt-2">
            Start with a 7-day free trial. $10/month after. Cancel anytime.
          </p>
        </DialogHeader>

        {clientSecret ? (
          <div className="mt-4">
            <StripeEmbeddedCheckout clientSecret={clientSecret} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <div className="rounded-lg border border-border bg-surface p-4">
                <div className="font-display text-lg mb-3">Free</div>
                <ul className="space-y-2 text-sm">
                  {FREE_FEATURES.map((f) => (
                    <li key={f.label} className="flex items-start gap-2">
                      {f.included ? (
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      ) : (
                        <X className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                      )}
                      <span className={f.included ? "" : "text-muted-foreground line-through"}>{f.label}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border-2 border-primary bg-primary/5 p-4">
                <div className="flex items-baseline justify-between mb-3">
                  <div className="font-display text-lg">Pro</div>
                  <div className="text-sm text-muted-foreground">
                    <span className="text-foreground text-lg font-semibold">$10</span> / mo
                  </div>
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

            <div className="mt-4 flex flex-col items-center gap-3">
              <div className="flex w-full max-w-sm gap-2">
                <Input
                  placeholder="Promo code (optional)"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value);
                    if (error) setError(null);
                  }}
                  disabled={loading}
                />
              </div>
              {error && (
                <div className="w-full max-w-sm flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <Button
                size="lg"
                className="w-full sm:w-auto sm:min-w-[280px]"
                onClick={startCheckout}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting…
                  </>
                ) : (
                  "Start 7-day free trial"
                )}
              </Button>
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              >
                Maybe later
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
