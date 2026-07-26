import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — The Grad Scout" }] }),
  component: AuthPage,
});

type Mode = "signin" | "signup" | "verify" | "forgot";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        if (data.user.email_confirmed_at) navigate({ to: "/dashboard" });
        else setMode("verify");
      }
    });
  }, [navigate]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        if (data.user && !data.session) {
          toast.success("Check your email to verify your account.");
          setMode("verify");
        } else if (data.session) {
          navigate({ to: "/onboarding" });
        }
      } else if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.user?.email_confirmed_at) {
          setMode("verify");
          toast.error("Please verify your email first.");
        } else {
          navigate({ to: "/dashboard" });
        }
      } else if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth`,
        });
        if (error) throw error;
        toast.success("Password reset link sent.");
        setMode("signin");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + "/dashboard",
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  };

  const resendVerification = async () => {
    if (!email) return toast.error("Enter your email above");
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) toast.error(error.message);
    else toast.success("Verification email resent");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center px-6 py-5">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-[15px] text-accent">🧭</span>
            <span className="text-lg font-display font-black tracking-tight text-primary">The Grad Scout</span>
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-border bg-surface-elevated p-8 shadow-sm">
            {mode === "verify" ? (
              <div className="text-center space-y-4">
                <h1 className="font-display text-2xl">Verify your email</h1>
                <p className="text-sm text-muted-foreground">
                  We sent a verification link to <span className="font-medium text-foreground">{email || "your inbox"}</span>. Click it to continue to your dashboard.
                </p>
                <Button variant="outline" className="w-full" onClick={resendVerification}>Resend email</Button>
                <button onClick={() => setMode("signin")} className="text-sm text-muted-foreground hover:text-foreground">
                  Back to sign in
                </button>
              </div>
            ) : (
              <>
                <h1 className="font-display text-2xl mb-1">
                  {mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset password" : "Welcome back"}
                </h1>
                <p className="text-sm text-muted-foreground mb-6">
                  {mode === "signup" ? "Start scoring programs against your profile." : mode === "forgot" ? "We'll email you a reset link." : "Sign in to your Grad Scout workspace."}
                </p>
                {mode !== "forgot" && (
                  <>
                    <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={busy} type="button">
                      <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>
                      Continue with Google
                    </Button>
                    <div className="flex items-center my-5">
                      <div className="flex-1 border-t border-border" />
                      <span className="px-3 text-xs uppercase tracking-wider text-muted-foreground">or</span>
                      <div className="flex-1 border-t border-border" />
                    </div>
                  </>
                )}
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  {mode === "signup" && (
                    <div>
                      <Label htmlFor="name">Full name</Label>
                      <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-1.5" />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1.5" autoComplete="email" />
                  </div>
                  {mode !== "forgot" && (
                    <div>
                      <Label htmlFor="password">Password</Label>
                      <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} className="mt-1.5" autoComplete={mode === "signup" ? "new-password" : "current-password"} />
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={busy}>
                    {busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
                  </Button>
                </form>
                <div className="mt-5 text-sm text-center text-muted-foreground space-x-3">
                  {mode === "signin" && (
                    <>
                      <button className="hover:text-foreground" onClick={() => setMode("signup")}>Create account</button>
                      <span>·</span>
                      <button className="hover:text-foreground" onClick={() => setMode("forgot")}>Forgot password?</button>
                    </>
                  )}
                  {mode === "signup" && (
                    <button className="hover:text-foreground" onClick={() => setMode("signin")}>Already have an account? Sign in</button>
                  )}
                  {mode === "forgot" && (
                    <button className="hover:text-foreground" onClick={() => setMode("signin")}>Back to sign in</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}