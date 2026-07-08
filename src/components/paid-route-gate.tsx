import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UpgradeModal } from "@/components/upgrade-modal";
import { AppShell } from "@/components/app-shell";
import { Loader2, Lock } from "lucide-react";
import { isPaidTier } from "@/lib/limits";

type State = "loading" | "paid" | "locked";

/**
 * Gate a whole route behind a paid subscription. Free users see a blurred
 * locked preview of the children with a persistent upgrade modal above.
 */
export function PaidRouteGate({
  title,
  children,
  previewNote,
}: {
  title: string;
  children: ReactNode;
  previewNote: string;
}) {
  const [state, setState] = useState<State>("loading");
  const [modalOpen, setModalOpen] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setState("locked"); return; }
      const { data: prof } = await supabase.from("profiles")
        .select("subscription_tier,subscription_status")
        .eq("id", u.user.id).single();
      const paid = prof && isPaidTier({
        tier: (prof as any).subscription_tier,
        status: (prof as any).subscription_status,
      });
      setState(paid ? "paid" : "locked");
    })();
  }, []);

  if (state === "loading") {
    return (
      <AppShell title={title}>
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (state === "paid") return <>{children}</>;

  return (
    <>
      <div className="relative pointer-events-none select-none">
        <div
          aria-hidden
          className="filter blur-md opacity-60"
          style={{ maskImage: "linear-gradient(to bottom, black 0%, black 60%, transparent 100%)" }}
        >
          {children}
        </div>
        <div className="pointer-events-auto absolute inset-x-0 top-32 flex justify-center px-4">
          <div className="rounded-2xl border border-border bg-surface-elevated shadow-lg px-6 py-5 max-w-md text-center">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Lock className="h-5 w-5 text-primary" />
            </div>
            <div className="font-display text-lg">{title} is a Pro feature</div>
            <p className="text-sm text-muted-foreground mt-1">{previewNote}</p>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="mt-3 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              See what you'll unlock
            </button>
          </div>
        </div>
      </div>
      <UpgradeModal open={modalOpen} onOpenChange={setModalOpen} />
    </>
  );
}