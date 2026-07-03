import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Linkedin, Trash2, MoreVertical, Loader2, Filter } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => ({ meta: [{ title: "Contacts — Admitly" }] }),
  component: ContactsPage,
});

type Status = "saved" | "reached_out" | "response_received" | "chat_scheduled" | "archived";

const COLUMNS: { key: Status; label: string }[] = [
  { key: "saved", label: "Saved" },
  { key: "reached_out", label: "Reached Out" },
  { key: "response_received", label: "Response Received" },
  { key: "chat_scheduled", label: "Chat Scheduled" },
  { key: "archived", label: "Archived" },
];

interface SavedContact {
  id: string;
  status: Status;
  notes: string | null;
  last_updated_at: string;
  program_contact_id: string;
  university_id: string;
  program_id: string;
  contact: {
    name: string;
    linkedin_url: string;
    graduation_year: string | null;
    country: string | null;
    headline: string | null;
  };
  university_name: string;
  program_name: string;
}

function ContactsPage() {
  const [rows, setRows] = useState<SavedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [uniFilter, setUniFilter] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const load = useCallback(async () => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data, error } = await supabase
      .from("user_saved_contacts")
      .select("id, status, notes, last_updated_at, program_contact_id, university_id, program_id, contact:program_contacts(name, linkedin_url, graduation_year, country, headline), university:universities(name), program:programs(name)")
      .eq("user_id", u.user.id)
      .order("last_updated_at", { ascending: false });
    if (error) { toast.error(error.message); setLoading(false); return; }
    const mapped: SavedContact[] = (data ?? []).map((r: any) => ({
      id: r.id,
      status: r.status as Status,
      notes: r.notes,
      last_updated_at: r.last_updated_at,
      program_contact_id: r.program_contact_id,
      university_id: r.university_id,
      program_id: r.program_id,
      contact: r.contact,
      university_name: r.university?.name ?? "",
      program_name: r.program?.name ?? "",
    }));
    setRows(mapped);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const universityOptions = useMemo(() => {
    const map = new Map<string, string>();
    rows.forEach((r) => map.set(r.university_id, r.university_name));
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const visibleIds = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      if (uniFilter.size > 0 && !uniFilter.has(r.university_id)) return;
      if (debounced) {
        const hay = `${r.contact?.name ?? ""} ${r.university_name}`.toLowerCase();
        if (!hay.includes(debounced)) return;
      }
      set.add(r.id);
    });
    return set;
  }, [rows, uniFilter, debounced]);

  const byColumn = useMemo(() => {
    const map: Record<Status, SavedContact[]> = {
      saved: [], reached_out: [], response_received: [], chat_scheduled: [], archived: [],
    };
    rows.forEach((r) => { if (map[r.status]) map[r.status].push(r); });
    return map;
  }, [rows]);

  const updateStatus = async (id: string, status: Status) => {
    const prev = rows;
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, status, last_updated_at: new Date().toISOString() } : r));
    const { error } = await supabase.from("user_saved_contacts")
      .update({ status, last_updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { setRows(prev); toast.error(error.message); }
  };

  const updateNotes = async (id: string, notes: string) => {
    const { error } = await supabase.from("user_saved_contacts")
      .update({ notes, last_updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRows((rs) => rs.map((r) => r.id === id ? { ...r, notes, last_updated_at: new Date().toISOString() } : r));
  };

  const removeContact = async (id: string) => {
    const prev = rows;
    const row = rows.find((r) => r.id === id);
    setRows((rs) => rs.filter((r) => r.id !== id));
    const { error } = await supabase.from("user_saved_contacts").delete().eq("id", id);
    if (error) { setRows(prev); toast.error(error.message); return; }
    // If this was a user-added contact owned by the current user, clean up the catalog row too.
    if (row?.program_contact_id) {
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        await supabase
          .from("program_contacts")
          .delete()
          .eq("id", row.program_contact_id)
          .eq("source", "user")
          .eq("added_by", u.user.id);
      }
    }
    toast.success("Contact removed");
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const newStatus = String(over.id) as Status;
    const row = rows.find((r) => r.id === active.id);
    if (!row || row.status === newStatus) return;
    updateStatus(String(active.id), newStatus);
  };

  const activeRow = activeId ? rows.find((r) => r.id === activeId) ?? null : null;

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-7xl p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] px-6 py-6">
        <div className="flex items-baseline justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="font-display text-3xl">Contacts</h1>
            <p className="text-muted-foreground text-sm mt-1">Track your outreach to students and alumni.</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Input
              placeholder="Search by name or university…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-[260px]"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-3.5 w-3.5 mr-1" />
                  University {uniFilter.size > 0 ? `(${uniFilter.size})` : ""}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[300px] overflow-auto">
                {universityOptions.length === 0 ? (
                  <DropdownMenuItem disabled>No universities</DropdownMenuItem>
                ) : (
                  <>
                    {universityOptions.map((u) => (
                      <DropdownMenuCheckboxItem
                        key={u.id}
                        checked={uniFilter.has(u.id)}
                        onCheckedChange={(c) => {
                          setUniFilter((s) => {
                            const n = new Set(s);
                            if (c) n.add(u.id); else n.delete(u.id);
                            return n;
                          });
                        }}
                      >
                        {u.name}
                      </DropdownMenuCheckboxItem>
                    ))}
                    {uniFilter.size > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setUniFilter(new Set())}>Clear</DropdownMenuItem>
                      </>
                    )}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState>
            You haven't saved any contacts yet. Open a university, go to the Outreach tab, and save students or alumni you'd like to connect with.
          </EmptyState>
        ) : visibleIds.size === 0 ? (
          <EmptyState>No contacts match your current filters.</EmptyState>
        ) : (
          <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {COLUMNS.map((col) => (
                <Column key={col.key} status={col.key} label={col.label} count={byColumn[col.key].length}>
                  {byColumn[col.key].map((r) => (
                    <ContactCard
                      key={r.id}
                      row={r}
                      dimmed={!visibleIds.has(r.id)}
                      onNotes={(notes) => updateNotes(r.id, notes)}
                      onRemove={() => removeContact(r.id)}
                    />
                  ))}
                </Column>
              ))}
            </div>
            <DragOverlay>
              {activeRow ? <CardBody row={activeRow} dragging /> : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>
    </AppShell>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-elevated p-12 text-center text-muted-foreground">
      {children}
    </div>
  );
}

function Column({ status, label, count, children }: { status: Status; label: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-[300px] shrink-0 rounded-xl border bg-surface-elevated/40 p-3 transition-colors ${isOver ? "border-primary bg-primary/5" : "border-border"}`}
    >
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="font-medium text-sm">{label}</h3>
        <Badge variant="secondary" className="text-xs">{count}</Badge>
      </div>
      <div className="space-y-2 min-h-[100px]">{children}</div>
    </div>
  );
}

function ContactCard({ row, dimmed, onNotes, onRemove }: { row: SavedContact; dimmed: boolean; onNotes: (n: string) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: row.id });
  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0.3 : dimmed ? 0.25 : 1 }}
      className="rounded-lg border border-border bg-background p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="min-w-0 flex-1 cursor-grab active:cursor-grabbing" {...listeners} {...attributes}>
          <div className="font-medium text-sm truncate">{row.contact?.name}</div>
          <div className="text-xs text-muted-foreground truncate">{row.university_name}</div>
          <div className="text-xs text-muted-foreground truncate">{row.program_name}</div>
        </div>
        <AlertDialog>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground p-1"><MoreVertical className="h-3.5 w-3.5" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <AlertDialogTrigger asChild>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" /> Remove
                </DropdownMenuItem>
              </AlertDialogTrigger>
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this contact?</AlertDialogTitle>
              <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onRemove}>Remove</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap mt-1.5 mb-2">
        {row.contact?.graduation_year && (
          <Badge variant="outline" className="text-[10px] py-0">{row.contact.graduation_year}</Badge>
        )}
        {row.contact?.country && (
          <Badge variant="secondary" className="text-[10px] py-0">{row.contact.country}</Badge>
        )}
      </div>
      {row.contact?.headline && (
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{row.contact.headline}</p>
      )}
      <NotesField initial={row.notes ?? ""} onSave={onNotes} />
      <div className="flex items-center justify-between mt-2">
        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
          <a href={row.contact?.linkedin_url} target="_blank" rel="noreferrer">
            <Linkedin className="h-3 w-3 mr-1" /> LinkedIn
          </a>
        </Button>
        <span className="text-[10px] text-muted-foreground">
          {new Date(row.last_updated_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

function CardBody({ row, dragging }: { row: SavedContact; dragging?: boolean }) {
  return (
    <div className={`rounded-lg border border-border bg-background p-3 shadow-lg w-[280px] ${dragging ? "" : ""}`}>
      <div className="font-medium text-sm">{row.contact?.name}</div>
      <div className="text-xs text-muted-foreground">{row.university_name}</div>
    </div>
  );
}

function NotesField({ initial, onSave }: { initial: string; onSave: (n: string) => void }) {
  const [val, setVal] = useState(initial);
  useEffect(() => { setVal(initial); }, [initial]);
  return (
    <textarea
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={() => { if (val !== initial) onSave(val); }}
      placeholder="Notes…"
      className="w-full min-h-[50px] text-xs rounded-md border border-border bg-background p-2 focus:outline-none focus:ring-1 focus:ring-ring resize-none"
    />
  );
}