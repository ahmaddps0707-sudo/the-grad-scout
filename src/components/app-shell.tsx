import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LogOut, Settings, LayoutDashboard, Users, MessagesSquare, FileText, Menu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useEffect, useState } from "react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [contactsCount, setContactsCount] = useState<number>(0);
  const [forumUnread, setForumUnread] = useState<boolean>(false);
  const [menuOpen, setMenuOpen] = useState(false);

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

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  const navItem = (to: string, label: string, Icon: typeof LayoutDashboard, badge?: number, dot?: boolean, mobile?: boolean) => {
    const active = pathname.startsWith(to);
    return (
      <Link
        to={to}
        search={to === "/dashboard" ? ({ quick: "all", status: "all", sort: "score" } as never) : undefined}
        className={`flex items-center gap-2 rounded-md px-3 text-sm transition-colors ${mobile ? "py-3" : "py-2"} ${
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
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            to="/dashboard"
            search={{ quick: "all", status: "all", sort: "score" } as never}
            className="flex min-w-0 items-center gap-2"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-[15px] text-accent">🧭</span>
            <span className="truncate whitespace-nowrap text-base font-display font-black tracking-tight text-primary sm:text-lg">
              <span className="hidden sm:inline">The </span>Grad Scout
            </span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {navItem("/dashboard", "Dashboard", LayoutDashboard)}
            {navItem("/contacts", "Contacts", Users, contactsCount)}
            {navItem("/resume", "Resume", FileText)}
            {navItem("/forum", "Forum", MessagesSquare, undefined, forumUnread)}
            {navItem("/settings", "Settings", Settings)}
            <Button variant="ghost" size="sm" onClick={signOut} className="ml-2 gap-2">
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </nav>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu" className="md:hidden shrink-0 relative">
                <Menu className="h-5 w-5" />
                {forumUnread && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[82vw] max-w-[320px] p-4">
              <SheetTitle className="mb-4 text-base">Menu</SheetTitle>
              <nav className="flex flex-col gap-1">
                {navItem("/dashboard", "Dashboard", LayoutDashboard, undefined, false, true)}
                {navItem("/contacts", "Contacts", Users, contactsCount, false, true)}
                {navItem("/resume", "Resume", FileText, undefined, false, true)}
                {navItem("/forum", "Forum", MessagesSquare, undefined, forumUnread, true)}
                {navItem("/settings", "Settings", Settings, undefined, false, true)}
                <Button variant="ghost" onClick={signOut} className="mt-2 justify-start gap-2">
                  <LogOut className="h-4 w-4" /> Sign out
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}