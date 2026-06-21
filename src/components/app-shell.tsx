import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LogOut, Settings, LayoutDashboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  const navItem = (to: string, label: string, Icon: typeof LayoutDashboard) => {
    const active = pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
          active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
        }`}
      >
        <Icon className="h-4 w-4" />
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-surface-elevated/70 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link to="/dashboard" className="text-xl font-display font-semibold tracking-tight text-primary">
            Admitly
          </Link>
          <nav className="flex items-center gap-1">
            {navItem("/dashboard", "Dashboard", LayoutDashboard)}
            {navItem("/settings", "Settings", Settings)}
            <Button variant="ghost" size="sm" onClick={signOut} className="ml-2 gap-2">
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </nav>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}