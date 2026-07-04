import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LogOut, Settings, LayoutDashboard, Users, MessagesSquare, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [contactsCount, setContactsCount] = useState<number>(0);
  const [forumUnread, setForumUnread] = useState<boolean>(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { count } = await supabase
        .from("user_saved_contacts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", u.user.id)
        .neq("status", "archived");
      if (active) setContactsCount(count ?? 0);
      // forum unread dot
      const { data: prof } = await supabase.from("profiles").select("last_visited_forum_at").eq("id", u.user.id).maybeSingle();
      const since = prof?.last_visited_forum_at ?? "1970-01-01T00:00:00Z";
      const { count: newPosts } = await supabase
        .from("forum_posts")
        .select("*", { count: "exact", head: true })
        .eq("is_removed", false)
        .gt("created_at", since);
      if (active) setForumUnread((newPosts ?? 0) > 0);
    };
    load();
    return () => { active = false; };
  }, [pathname]);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  const navItem = (to: string, label: string, Icon: typeof LayoutDashboard, badge?: number, dot?: boolean) => {
    const active = pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
          active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
        }`}
      >
        <span className="relative inline-flex">
          <Icon className="h-4 w-4" />
          {dot && !active && <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-primary" />}
        </span>
        {label}
        {badge && badge > 0 ? (
          <span className={`ml-1 inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-primary/15 text-primary"}`}>
            {badge}
          </span>
        ) : null}
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
            {navItem("/contacts", "Contacts", Users, contactsCount)}
            {navItem("/resume", "Resume", FileText)}
            {navItem("/forum", "Forum", MessagesSquare, undefined, forumUnread)}
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