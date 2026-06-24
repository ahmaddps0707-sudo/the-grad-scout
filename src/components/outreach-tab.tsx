import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Linkedin, Check } from "lucide-react";
import { toast } from "sonner";

interface Contact {
  id: string;
  name: string;
  linkedin_url: string;
  graduation_year: string | null;
  country: string | null;
  headline: string | null;
}

export function OutreachTab({
  programId,
  universityId,
  universityName,
  programName,
  userCountry,
}: {
  programId: string;
  universityId: string;
  universityName: string;
  programName: string;
  userCountry: string | null;
}) {
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("find-program-contacts", {
        body: {
          program_id: programId,
          university_name: universityName,
          program_name: programName,
          user_country: userCountry ?? "",
        },
      });
      if (error) throw error;
      setContacts((data?.contacts ?? []) as Contact[]);

      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: savedRows } = await supabase
          .from("user_saved_contacts")
          .select("program_contact_id")
          .eq("user_id", u.user.id)
          .eq("program_id", programId);
        setSaved(new Set((savedRows ?? []).map((r) => r.program_contact_id)));
      }
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }, [programId, universityName, programName, userCountry]);

  useEffect(() => { load(); }, [load]);

  const saveContact = async (c: Contact) => {
    if (saved.has(c.id) || saving.has(c.id)) return;
    setSaving((s) => new Set(s).add(c.id));
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("Not signed in"); return; }
    const { error } = await supabase.from("user_saved_contacts").insert({
      user_id: u.user.id,
      program_contact_id: c.id,
      university_id: universityId,
      program_id: programId,
      status: "saved",
    });
    setSaving((s) => { const n = new Set(s); n.delete(c.id); return n; });
    if (error) { toast.error(error.message); return; }
    setSaved((s) => new Set(s).add(c.id));
    toast.success("Contact saved — view in Contacts page");
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface-elevated p-6 space-y-4">
        <div className="text-sm text-muted-foreground">Finding students and alumni for this program…</div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    const query = `${programName} ${universityName}`;
    return (
      <div className="rounded-xl border border-border bg-surface-elevated p-6 space-y-3">
        <p className="text-sm text-foreground">
          We couldn't find publicly available profiles for this program. Try searching LinkedIn directly for:
        </p>
        <code className="block rounded-md bg-muted px-3 py-2 text-sm font-mono select-all">
          {query}
        </code>
        <Button variant="outline" size="sm" asChild>
          <a
            href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`}
            target="_blank"
            rel="noreferrer"
          >
            Search on LinkedIn <ExternalLink className="h-3.5 w-3.5 ml-1" />
          </a>
        </Button>
      </div>
    );
  }

  const home = (userCountry ?? "").trim().toLowerCase();
  const sorted = [...contacts].sort((a, b) => {
    const ah = home && (a.country ?? "").trim().toLowerCase() === home ? 0 : 1;
    const bh = home && (b.country ?? "").trim().toLowerCase() === home ? 0 : 1;
    return ah - bh;
  });

  return (
    <div className="space-y-3">
      {sorted.map((c) => {
        const fromHome = home && (c.country ?? "").trim().toLowerCase() === home;
        const isSaved = saved.has(c.id);
        const isSaving = saving.has(c.id);
        return (
          <div key={c.id} className="rounded-xl border border-border bg-surface-elevated p-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="font-medium">{c.name}</h4>
                {fromHome && (
                  <Badge variant="secondary" className="text-xs">From your country</Badge>
                )}
                {c.graduation_year && (
                  <Badge variant="outline" className="text-xs">{c.graduation_year}</Badge>
                )}
              </div>
              {c.headline && <p className="text-sm text-muted-foreground mt-1">{c.headline}</p>}
              {c.country && <p className="text-xs text-muted-foreground mt-1">{c.country}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" asChild>
                <a href={c.linkedin_url} target="_blank" rel="noreferrer">
                  <Linkedin className="h-3.5 w-3.5 mr-1" /> LinkedIn
                </a>
              </Button>
              <Button
                size="sm"
                variant={isSaved ? "secondary" : "default"}
                disabled={isSaved || isSaving}
                onClick={() => saveContact(c)}
              >
                {isSaved ? (<><Check className="h-3.5 w-3.5 mr-1" /> Saved</>) : isSaving ? "Saving…" : "Save Contact"}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}