import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, FileText, Loader2, Check, Download, Sparkles, ChevronDown, ExternalLink } from "lucide-react";
import { emptyContent, nextVersionName, isMostlyEmpty, type ResumeContent } from "@/lib/resume-types";
import { ResumeEditor } from "@/components/resume/editor";
import { ResumePreview } from "@/components/resume/preview";

export const Route = createFileRoute("/_authenticated/resume")({
  head: () => ({ meta: [{ title: "Resume Builder — Admitly" }, { name: "description", content: "Upload, edit, and tailor your resume for master's applications with AI assistance." }] }),
  component: GatedResumePage,
});

import { PaidRouteGate } from "@/components/paid-route-gate";
function GatedResumePage() {
  return (
    <PaidRouteGate
      title="Resume Builder"
      previewNote="Upload, edit, and tailor your resume with AI writing assistance built for master's applications."
    >
      <ResumePage />
    </PaidRouteGate>
  );
}

type ResumeRow = { id: string; user_id: string; version_name: string; template_id: string | null; content: ResumeContent; is_active: boolean; source: string; original_file_url: string | null; parse_status: string | null; created_at: string; updated_at: string };

const MAX_SIZE = 5 * 1024 * 1024;
const ALLOWED = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

function ResumePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [resumes, setResumes] = useState<ResumeRow[]>([]);
  const [current, setCurrent] = useState<ResumeRow | null>(null);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const [content, setContent] = useState<ResumeContent>(emptyContent());
  const [dirty, setDirty] = useState(false);
  const [parseBanner, setParseBanner] = useState<"none" | "empty" | "partial">("none");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadMode, setUploadMode] = useState<"new" | "replace">("new");
  const [newVersionOpen, setNewVersionOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const debounceRef = useRef<any>(null);
  const initialLoad = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    setUserId(u.user.id);
    const { data: rs } = await supabase.from("resumes" as any).select("*").eq("user_id", u.user.id).order("updated_at", { ascending: false });
    const list = (rs ?? []) as unknown as ResumeRow[];
    setResumes(list);
    // Load the most recently edited version (latest updated_at)
    const latest = list[0] ?? null;
    if (latest) {
      setCurrent(latest);
      setContent(mergeWithEmpty(latest.content));
    }
    setLoading(false);
    initialLoad.current = false;
  }, []);

  useEffect(() => { load(); }, [load]);

  // Autosave debounced
  useEffect(() => {
    if (!current || initialLoad.current) return;
    if (!dirty) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSaving("saving");
    debounceRef.current = setTimeout(async () => {
      const { error } = await supabase.from("resumes" as any).update({ content: content as any, updated_at: new Date().toISOString() }).eq("id", current.id);
      if (error) { toast.error("Save failed"); setSaving("idle"); return; }
      setSaving("saved");
      setDirty(false);
      setTimeout(() => setSaving("idle"), 1500);
    }, 2000);
  }, [content, current, dirty]);

  // Warn on unload
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Poll parse status
  useEffect(() => {
    if (!current || current.parse_status !== "parsing" && current.parse_status !== "pending") return;
    if (current.parse_status !== "parsing" && current.parse_status !== "pending") return;
    const timer = setInterval(async () => {
      const { data } = await supabase.from("resumes" as any).select("*").eq("id", current.id).maybeSingle();
      if (!data) return;
      const row = data as unknown as ResumeRow;
      if (row.parse_status === "done" || row.parse_status === "failed") {
        setCurrent(row);
        const merged = mergeWithEmpty(row.content);
        setContent(merged);
        if (row.parse_status === "failed" || isMostlyEmpty(merged)) {
          setParseBanner("empty");
        } else if (isPartial(merged)) {
          setParseBanner("partial");
          toast.success("Resume parsed — review and edit your content below");
        } else {
          toast.success("Resume parsed — review and edit your content below");
        }
        clearInterval(timer);
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [current?.id, current?.parse_status]);

  const onContentChange = (c: ResumeContent) => { setContent(c); setDirty(true); };

  const startBlank = async () => {
    if (!userId) return;
    const name = nextVersionName(resumes.map((r) => r.version_name));
    const isFirst = resumes.length === 0;
    const { data, error } = await supabase.from("resumes" as any).insert({
      user_id: userId, version_name: name, content: emptyContent() as any,
      source: "scratch", parse_status: null, is_active: isFirst,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    await load();
    setCurrent(data as unknown as ResumeRow);
  };

  const validateFile = (f: File): string | null => {
    if (!ALLOWED.includes(f.type) && !/\.(pdf|docx)$/i.test(f.name)) return "Only PDF and DOCX files are supported.";
    if (f.size > MAX_SIZE) return "File is too large. Maximum size is 5MB. Try compressing your PDF and uploading again.";
    return null;
  };

  const handleFileSelected = (f: File) => {
    const err = validateFile(f);
    if (err) { toast.error(err); return; }
    setPendingFile(f);
    if (resumes.length === 0) {
      doUpload(f, "new");
    } else {
      setUploadMode("new");
      setUploadModalOpen(true);
    }
  };

  const doUpload = async (f: File, mode: "new" | "replace") => {
    if (!userId) return;
    setUploadModalOpen(false);
    const path = `${userId}/${Date.now()}_${f.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("resumes").upload(path, f, { contentType: f.type });
    if (upErr) { toast.error(`Upload failed: ${upErr.message}`); return; }

    let resumeId: string;
    if (mode === "new" || !current) {
      const name = nextVersionName(resumes.map((r) => r.version_name));
      const isFirst = resumes.length === 0;
      const { data, error } = await supabase.from("resumes" as any).insert({
        user_id: userId, version_name: name, content: emptyContent() as any,
        source: "upload", parse_status: "pending", original_file_url: path, is_active: isFirst,
      }).select().single();
      if (error) { toast.error(error.message); return; }
      const row = data as unknown as ResumeRow;
      resumeId = row.id;
      setCurrent({ ...row, parse_status: "parsing" });
      setResumes((prev) => [row, ...prev]);
    } else {
      resumeId = current.id;
      await supabase.from("resumes" as any).update({ parse_status: "pending", original_file_url: path, content: emptyContent() as any }).eq("id", current.id);
      setCurrent({ ...current, parse_status: "parsing", original_file_url: path });
      setContent(emptyContent());
    }

    const { error: fnErr } = await supabase.functions.invoke("parse-resume", {
      body: { resume_id: resumeId, user_id: userId, file_path: path },
    });
    if (fnErr) { toast.error(`Parse trigger failed: ${fnErr.message}`); }
  };

  const switchVersion = async (id: string) => {
    if (dirty && !confirm("You have unsaved changes. Discard and switch?")) return;
    const r = resumes.find((x) => x.id === id);
    if (!r) return;
    setCurrent(r);
    setContent(mergeWithEmpty(r.content));
    setDirty(false);
    setParseBanner("none");
  };

  const deleteVersion = async (id: string) => {
    if (!confirm("Delete this version? This cannot be undone.")) return;
    await supabase.from("resumes" as any).delete().eq("id", id);
    await load();
  };

  const createNewVersion = async (copy: boolean, name: string) => {
    if (!userId) return;
    const finalName = name.trim() || nextVersionName(resumes.map((r) => r.version_name));
    const newContent = copy && current ? content : emptyContent();
    const { data, error } = await supabase.from("resumes" as any).insert({
      user_id: userId, version_name: finalName,
      content: newContent as any, source: copy ? current!.source : "scratch",
      parse_status: null, is_active: false,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    setNewVersionOpen(false);
    await load();
    const row = data as unknown as ResumeRow;
    setCurrent(row);
    setContent(mergeWithEmpty(row.content));
  };

  const renameCurrent = async (v: string) => {
    if (!current) return;
    const name = v.trim().slice(0, 50);
    if (!name || name === current.version_name) { setRenaming(false); return; }
    await supabase.from("resumes" as any).update({ version_name: name }).eq("id", current.id);
    setCurrent({ ...current, version_name: name });
    setResumes((prev) => prev.map((r) => r.id === current.id ? { ...r, version_name: name } : r));
    setRenaming(false);
  };

  const downloadPDF = async () => {
    if (!current) return;
    const el = document.getElementById("resume-print-area");
    if (!el) return;
    const fullName = (content.personal.full_name || "Resume").trim();
    const filename = `${fullName.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "Resume"}.pdf`;
    try {
      // Render to PDF via the browser's print engine in a hidden iframe.
      // Avoids html2canvas' oklch()/lab() parsing errors from Tailwind v4 by
      // inlining every computed style as rgb, with no external stylesheet.
      const cvs = document.createElement("canvas");
      const ctx = cvs.getContext("2d")!;
      const toRgb = (v: string): string => {
        if (!v || v === "none" || v === "transparent" || v.startsWith("rgb")) return v;
        try { ctx.fillStyle = "#000"; ctx.fillStyle = v; return ctx.fillStyle as string; }
        catch { return v; }
      };
      const normalize = (v: string): string =>
        v ? v.replace(/(oklch|oklab|lab|lch|color)\([^)]*\)/gi, (m) => toRgb(m)) : v;
      const clone = el.cloneNode(true) as HTMLElement;
      const srcAll = [el, ...Array.from(el.querySelectorAll<HTMLElement>("*"))];
      const dstAll = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>("*"))];
      srcAll.forEach((n, i) => {
        const d = dstAll[i]; if (!d) return;
        const cs = window.getComputedStyle(n);
        let css = "";
        for (let j = 0; j < cs.length; j++) {
          const prop = cs.item(j);
          const val = cs.getPropertyValue(prop);
          if (!val) continue;
          css += `${prop}:${normalize(val)};`;
        }
        d.setAttribute("style", css);
      });
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none;";
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument!;
      doc.open();
      doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${filename.replace(/\.pdf$/, "")}</title><style>@page{size:A4;margin:0;}html,body{margin:0;padding:0;background:#fff;}*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}</style></head><body></body></html>`);
      doc.close();
      doc.body.appendChild(clone);
      await new Promise((r) => setTimeout(r, 150));
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
      setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 1500);
      toast.success("Choose 'Save as PDF' in the print dialog");
    } catch (e: any) {
      toast.error(`Download failed: ${e?.message || "unknown error"}`);
    }
  };

  const originalFileUrl = current?.original_file_url ?? null;
  const [origSignedUrl, setOrigSignedUrl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      if (!originalFileUrl) { setOrigSignedUrl(null); return; }
      const { data } = await supabase.storage.from("resumes").createSignedUrl(originalFileUrl, 3600);
      setOrigSignedUrl(data?.signedUrl ?? null);
    })();
  }, [originalFileUrl]);

  if (loading) {
    return <AppShell><div className="mx-auto max-w-7xl p-6"><Loader2 className="h-5 w-5 animate-spin" /></div></AppShell>;
  }

  // Start screen
  if (!current) {
    return (
      <AppShell>
        <div className="mx-auto max-w-5xl p-6 space-y-8">
          <div>
            <h1 className="text-2xl font-semibold">Build your resume</h1>
            <p className="text-muted-foreground text-sm mt-1">Upload an existing resume for AI parsing, or start from scratch.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <UploadCard onFile={handleFileSelected} />
            <button className="rounded-lg border-2 border-dashed p-8 text-left hover:bg-secondary/40 transition-colors" onClick={startBlank}>
              <FileText className="h-6 w-6 mb-2 text-primary" />
              <div className="font-semibold">Start from scratch</div>
              <div className="text-sm text-muted-foreground mt-1">Open an empty editor and fill in your details.</div>
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  const isParsing = current.parse_status === "parsing" || current.parse_status === "pending";

  return (
    <AppShell>
      <div className="mx-auto max-w-[1600px] p-4 lg:p-6">
        {/* Version bar */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {renaming ? (
            <Input autoFocus defaultValue={current.version_name} maxLength={50} className="max-w-xs h-8" onBlur={(e) => renameCurrent(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenaming(false); }} />
          ) : (
            <button className="text-lg font-semibold hover:underline" title="Click to rename" onClick={() => setRenaming(true)}>{current.version_name}</button>
          )}
          <Badge variant="outline" className="text-[10px]">Editing</Badge>
          <div className="text-xs text-muted-foreground ml-2">
            {saving === "saving" && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>}
            {saving === "saved" && <span className="inline-flex items-center gap-1 text-green-600"><Check className="h-3 w-3" /> Saved</span>}
          </div>
          <div className="ml-auto flex gap-2">
            <label className="inline-flex">
              <Button variant="outline" size="sm" asChild>
                <span className="cursor-pointer gap-1"><Upload className="h-3 w-3" /> Upload Resume</span>
              </Button>
              <input type="file" className="hidden" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelected(f); e.currentTarget.value = ""; }} />
            </label>
            <Button variant="outline" size="sm" onClick={() => setNewVersionOpen(true)}>New Version</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm">Versions <ChevronDown className="h-3 w-3" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                {resumes.map((r) => (
                  <div key={r.id} className="px-2 py-1.5 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium flex items-center gap-1">
                          {r.version_name}
                          {current?.id === r.id && <Badge variant="outline" className="text-[10px]">Editing</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleString()}</div>
                      </div>
                    </div>
                    <div className="flex gap-1 mt-1">
                      <Button variant="ghost" size="sm" onClick={() => switchVersion(r.id)}>Switch</Button>
                      {current?.id !== r.id && resumes.length > 1 && <Button variant="ghost" size="sm" onClick={() => deleteVersion(r.id)}>Delete</Button>}
                    </div>
                    <DropdownMenuSeparator />
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Banners */}
        {parseBanner === "empty" && (
          <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex items-start justify-between gap-3">
            <div>
              We couldn't extract content from your resume — this usually happens with scanned or image-based PDFs. Your original file has been saved. Fill in your details below and use the Download PDF button when you're done.
              {origSignedUrl && <> <a className="underline ml-1 inline-flex items-center gap-1" href={origSignedUrl} target="_blank" rel="noreferrer">View original file <ExternalLink className="h-3 w-3" /></a></>}
            </div>
            <button onClick={() => setParseBanner("none")} className="text-xs">Dismiss</button>
          </div>
        )}
        {parseBanner === "partial" && (
          <div className="mb-4 rounded-md border border-blue-300 bg-blue-50 p-3 text-sm text-blue-900 flex items-start justify-between gap-3">
            <div>We partially parsed your resume — some sections may need filling in manually. Review everything below before continuing.</div>
            <button onClick={() => setParseBanner("none")} className="text-xs">Dismiss</button>
          </div>
        )}

        {isParsing ? (
          <div className="rounded-md border p-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
            <div className="font-medium">Parsing your resume...</div>
            <div className="text-sm text-muted-foreground">This usually takes 10–30 seconds.</div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
            <div className="min-w-0 max-h-[calc(100vh-180px)] overflow-y-auto pr-2">
              <ResumeEditor
                content={content}
                onChange={onContentChange}
                resumeId={current.id}
                hasPublications={content.publications.length > 0}
                hasAwards={content.awards.length > 0}
                hasVolunteer={content.volunteer.length > 0}
              />
            </div>
            <div className="min-w-0 max-h-[calc(100vh-180px)] overflow-y-auto">
              <div className="flex items-center gap-2 mb-2 flex-wrap justify-end">
                <Button size="sm" onClick={downloadPDF} className="gap-1"><Download className="h-3 w-3" /> Download PDF</Button>
              </div>
              <ResumePreview content={content} template="Clean Professional" />
            </div>
          </div>
        )}
      </div>

      {/* Upload mode modal */}
      <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>What do you want to do with this file?</DialogTitle></DialogHeader>
          <RadioGroup value={uploadMode} onValueChange={(v) => setUploadMode(v as any)}>
            <label className="flex items-start gap-2 p-3 rounded-md border cursor-pointer"><RadioGroupItem value="new" /><div><div className="font-medium">Add as a new version</div><div className="text-xs text-muted-foreground">Creates a new resume version, keeps your current one.</div></div></label>
            <label className="flex items-start gap-2 p-3 rounded-md border cursor-pointer"><RadioGroupItem value="replace" /><div><div className="font-medium">Replace current version</div><div className="text-xs text-muted-foreground">Overwrites {current?.version_name}. This cannot be undone.</div></div></label>
          </RadioGroup>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setUploadModalOpen(false)}>Cancel</Button>
            <Button onClick={() => {
              if (!pendingFile) return;
              if (uploadMode === "replace" && !confirm(`This will replace all content in ${current?.version_name}. Your original file for this version will be updated. This cannot be undone.`)) return;
              doUpload(pendingFile, uploadMode);
            }}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Version modal */}
      <NewVersionModal open={newVersionOpen} onOpenChange={setNewVersionOpen} defaultName={nextVersionName(resumes.map((r) => r.version_name))} onCreate={createNewVersion} />
    </AppShell>
  );
}

function mergeWithEmpty(c: any): ResumeContent {
  const base = emptyContent();
  if (!c || typeof c !== "object") return base;
  return {
    personal: { ...base.personal, ...(c.personal ?? {}) },
    work_experience: Array.isArray(c.work_experience) ? c.work_experience : [],
    education: Array.isArray(c.education) ? c.education : [],
    skills: { ...base.skills, ...(c.skills ?? {}) },
    projects: Array.isArray(c.projects) ? c.projects : [],
    publications: Array.isArray(c.publications) ? c.publications : [],
    awards: Array.isArray(c.awards) ? c.awards : [],
    volunteer: Array.isArray(c.volunteer) ? c.volunteer : [],
    section_order: (() => {
      const src = Array.isArray(c.section_order) ? c.section_order.filter((k: any) => k === "work" || k === "education") : [];
      const out = [...src];
      for (const k of base.section_order!) if (!out.includes(k)) out.push(k);
      return out as any;
    })(),
  };
}

function isPartial(c: ResumeContent): boolean {
  const sections = [c.work_experience.length, c.education.length, c.projects.length];
  const nonempty = sections.filter((n) => n > 0).length;
  return nonempty > 0 && nonempty < sections.length;
}

function UploadCard({ onFile }: { onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const handle = (f: File | null) => {
    if (!f) return;
    setErr(null);
    onFile(f);
  };
  return (
    <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) handle(f); }}
      className={`block rounded-lg border-2 border-dashed p-8 text-left cursor-pointer transition-colors ${drag ? "border-primary bg-primary/5" : "hover:bg-secondary/40"}`}>
      <Upload className="h-6 w-6 mb-2 text-primary" />
      <div className="font-semibold">Upload your existing resume</div>
      <div className="text-sm text-muted-foreground mt-1">Drag and drop your PDF or DOCX here, or click to browse. Max 5MB.</div>
      {err && <div className="mt-2 text-sm text-destructive">{err}</div>}
      <input ref={ref} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="hidden" onChange={(e) => handle(e.target.files?.[0] ?? null)} />
    </label>
  );
}

function UploadInput({ onFile, inline }: { onFile: (f: File) => void; inline?: boolean }) {
  return (
    <span className={inline ? "inline-flex items-center gap-1" : ""}>
      <Upload className="h-3 w-3" /> Upload new file
      <input type="file" className="hidden" accept=".pdf,.docx" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
    </span>
  );
}

function NewVersionModal({ open, onOpenChange, defaultName, onCreate }: { open: boolean; onOpenChange: (v: boolean) => void; defaultName: string; onCreate: (copy: boolean, name: string) => void }) {
  const [copy, setCopy] = useState(true);
  const [name, setName] = useState(defaultName);
  useEffect(() => { setName(defaultName); }, [defaultName, open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Create new version</DialogTitle></DialogHeader>
        <RadioGroup value={copy ? "copy" : "blank"} onValueChange={(v) => setCopy(v === "copy")}>
          <label className="flex items-start gap-2 p-3 rounded-md border cursor-pointer"><RadioGroupItem value="copy" /><div><div className="font-medium">Copy current version</div><div className="text-xs text-muted-foreground">Duplicates your current content.</div></div></label>
          <label className="flex items-start gap-2 p-3 rounded-md border cursor-pointer"><RadioGroupItem value="blank" /><div><div className="font-medium">Start blank</div><div className="text-xs text-muted-foreground">Empty resume.</div></div></label>
        </RadioGroup>
        <div>
          <Label>Version name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value.slice(0, 50))} maxLength={50} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onCreate(copy, name)}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}