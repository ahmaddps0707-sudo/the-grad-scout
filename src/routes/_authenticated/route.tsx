import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    // Gate: send users without completed onboarding to the wizard
    if (!location.pathname.startsWith("/onboarding")) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_complete")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!profile?.onboarding_complete) throw redirect({ to: "/onboarding" });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});