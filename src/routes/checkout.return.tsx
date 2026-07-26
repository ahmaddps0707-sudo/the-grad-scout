import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { envScopedSub } from "@/lib/subscription";
import { AppShell } from "@/components/app-shell";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/checkout/return")({
  head: () => ({ meta: [{ title: "Confirming your subscription — The Grad Scout" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const navigate = useNavigate();
  const [state, setState] = useState<"polling" | "confirmed" | "timeout">("polling");

  useEffect(() => {
    let cancelled = false;
    const env = (() => {
      try { return getStripeEnvironment(); } catch { return "sandbox" as const; }
    })();

    const start = Date.now();
    const TIMEOUT_MS = 15_000;
    const POLL_MS = 1_200;

    async function poll() {
      if (cancelled) return;
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setState("timeout"); return; }
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", u.user.id)
        .maybeSingle();
      const view = envScopedSub(profile, env);
      if (view.tier === "paid") {
        setState("confirmed");
        setTimeout(() => navigate({ to: "/settings" }), 900);
        return;
      }
      if (Date.now() - start >= TIMEOUT_MS) {
        setState("timeout");
        return;
      }
      setTimeout(poll, POLL_MS);
    }
    poll();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-6 py-24 text-center space-y-4">
        {state === "polling" && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <h1 className="font-display text-2xl">Confirming your subscription…</h1>
            <p className="text-sm text-muted-foreground">Hang tight — we're syncing with Stripe. This usually takes a few seconds.</p>
          </>
        )}
        {state === "confirmed" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <h1 className="font-display text-2xl">You're all set</h1>
            <p className="text-sm text-muted-foreground">Taking you to your settings…</p>
          </>
        )}
        {state === "timeout" && (
          <>
            <AlertCircle className="mx-auto h-10 w-10 text-amber-500" />
            <h1 className="font-display text-2xl">Almost there</h1>
            <p className="text-sm text-muted-foreground">Your payment is processing but hasn't landed yet. It may take another minute. Refresh <a className="underline" href="/settings">Settings</a> to see the update.</p>
          </>
        )}
      </div>
    </AppShell>
  );
}