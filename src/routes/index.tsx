import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Admitly — Find your master's program" },
      { name: "description", content: "Research, score, and track international master's programs in one calm, credible workspace." },
      { property: "og:title", content: "Admitly — Find your master's program" },
      { property: "og:description", content: "Research, score, and track international master's programs." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link to="/" className="text-xl font-display font-semibold tracking-tight text-primary">
            Admitly
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" } as never}>Get started</Link>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-6 pt-24 pb-32">
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
          For international master's applicants
        </p>
        <h1 className="mt-5 text-5xl md:text-6xl font-display leading-[1.05] text-foreground">
          Research master's programs with the rigor they deserve.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground leading-relaxed">
          Admitly scores real programs against your profile, surfaces verified admissions and funding data, and keeps every application on one calm dashboard.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/auth">Start researching — free</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/auth">I already have an account</Link>
          </Button>
        </div>
        <div className="mt-20 grid gap-6 md:grid-cols-3">
          {[
            { h: "Scored matches", b: "Five tailored programs at a time, ranked 0–100 against your profile and budget." },
            { h: "Verified data", b: "Deadlines, tuition, GA/TA and class profile pulled from current university sources." },
            { h: "One pipeline", b: "Track every application from Planning through Offer in one workspace." },
          ].map((c) => (
            <div key={c.h} className="rounded-xl border border-border bg-surface p-6">
              <div className="font-display text-lg text-foreground">{c.h}</div>
              <div className="mt-2 text-sm text-muted-foreground leading-relaxed">{c.b}</div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
