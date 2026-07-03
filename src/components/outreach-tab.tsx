import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ExternalLink, Linkedin, Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const addContactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name is too long"),
  linkedin_url: z
    .string()
    .trim()
    .max(500, "URL is too long")
    .regex(/^https?:\/\/(www\.)?linkedin\.com\/.+/i, "Must be a linkedin.com URL"),
});

function normalizeLinkedInUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url.trim().replace(/\/+$/, "").toLowerCase();
  }
}

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
  const [fallbackMsg, setFallbackMsg] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addErrors, setAddErrors] = useState<{ name?: string; linkedin_url?: string }>({});
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFallbackMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("find-program-contacts", {
        body: {
          program_id: programId,
          university_name: universityName,
          program_name: programName,
          user_country: userCountry ?? "",
        },
      });
      if (error) {
        setContacts([]);
        setFallbackMsg("We couldn't load contacts right now. You can still search LinkedIn directly below.");
      } else if (data && data.ok === false) {
        setContacts([]);
        const code = data.code as string | undefined;
        const msg =
          code === "ai_rate_limit"
            ? "Contact discovery is busy right now. Try again in a moment."
            : code === "ai_credits"
            ? "AI credits exhausted — ask the workspace owner to add credits."
            : "We couldn't load contacts right now. You can still search LinkedIn directly below.";
        setFallbackMsg(msg);
      } else {
        setContacts((data?.contacts ?? []) as Contact[]);
      }

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
      setContacts([]);
      setFallbackMsg("We couldn't load contacts right now. You can still search LinkedIn directly below.");
      console.error("outreach load error", e);
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

  const submitAddContact = async () => {
    const parsed = addContactSchema.safeParse({ name: addName, linkedin_url: addUrl });
    if (!parsed.success) {
      const errs: { name?: string; linkedin_url?: string } = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as "name" | "linkedin_url";
        if (!errs[key]) errs[key] = issue.message;
      }
      setAddErrors(errs);
      return;
    }
    setAddErrors({});
    setSubmitting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { toast.error("Not signed in"); return; }
      const normUrl = normalizeLinkedInUrl(parsed.data.linkedin_url);

      // Look for an existing row (AI catalog or this user's private row) for the same URL
      const { data: existing } = await supabase
        .from("program_contacts")
        .select("id, source, added_by")
        .eq("program_id", programId)
        .ilike("linkedin_url", normUrl)
        .limit(1)
        .maybeSingle();

      let contactRow: Contact;
      if (existing) {
        contactRow = {
          id: existing.id,
          name: parsed.data.name,
          linkedin_url: normUrl,
          graduation_year: null,
          country: null,
          headline: null,
        };
      } else {
        const { data: inserted, error: insErr } = await supabase
          .from("program_contacts")
          .insert({
            program_id: programId,
            name: parsed.data.name,
            linkedin_url: normUrl,
            source: "user",
            added_by: u.user.id,
          })
          .select("id, name, linkedin_url, graduation_year, country, headline")
          .single();
        if (insErr || !inserted) { toast.error(insErr?.message ?? "Could not add contact"); return; }
        contactRow = inserted as Contact;
      }

      // Auto-save (skip conflict quietly if already saved)
      const { error: saveErr } = await supabase.from("user_saved_contacts").insert({
        user_id: u.user.id,
        program_contact_id: contactRow.id,
        university_id: universityId,
        program_id: programId,
        status: "saved",
      });
      if (saveErr && !/duplicate|unique/i.test(saveErr.message)) {
        toast.error(saveErr.message);
        return;
      }

      setContacts((prev) => {
        if (prev.some((p) => p.id === contactRow.id)) return prev;
        return [contactRow, ...prev];
      });
      setSaved((s) => new Set(s).add(contactRow.id));
      setAddOpen(false);
      setAddName("");
      setAddUrl("");
      toast.success("Contact added");
    } finally {
      setSubmitting(false);
    }
  };

  const AddContactDialog = (
    <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setAddErrors({}); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add contact
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a contact</DialogTitle>
          <DialogDescription>
            Manually add a student or alum you found. Only you will see this contact.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="add-contact-name">Name</Label>
            <Input
              id="add-contact-name"
              value={addName}
              maxLength={100}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Jane Doe"
            />
            {addErrors.name && <p className="text-xs text-destructive">{addErrors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="add-contact-url">LinkedIn URL</Label>
            <Input
              id="add-contact-url"
              value={addUrl}
              maxLength={500}
              onChange={(e) => setAddUrl(e.target.value)}
              placeholder="https://www.linkedin.com/in/…"
            />
            {addErrors.linkedin_url && <p className="text-xs text-destructive">{addErrors.linkedin_url}</p>}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submitAddContact} disabled={submitting}>
            {submitting ? "Adding…" : "Add contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-surface-elevated p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">Finding students and alumni for this program…</div>
          {AddContactDialog}
        </div>
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
        <div className="flex items-center justify-end">{AddContactDialog}</div>
        {fallbackMsg && (
          <p className="text-sm text-amber-600 dark:text-amber-400">{fallbackMsg}</p>
        )}
        <p className="text-sm text-foreground">
          We couldn't find publicly available profiles for this program. Try searching LinkedIn directly for:
        </p>
        <code className="block rounded-md bg-muted px-3 py-2 text-sm font-mono select-all">
          {query}
        </code>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}`}
              target="_blank"
              rel="noreferrer"
            >
              Search on LinkedIn <ExternalLink className="h-3.5 w-3.5 ml-1" />
            </a>
          </Button>
          {fallbackMsg && (
            <Button variant="ghost" size="sm" onClick={() => load()}>Retry</Button>
          )}
        </div>
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
      <div className="flex items-center justify-end">{AddContactDialog}</div>
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