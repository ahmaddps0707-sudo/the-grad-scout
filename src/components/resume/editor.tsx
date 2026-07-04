import { useState } from "react";
import type { ResumeContent, WorkEntry, EducationEntry, ProjectEntry, PublicationEntry, AwardEntry, VolunteerEntry } from "@/lib/resume-types";
import { newWork, newEducation, newProject, newPublication, newAward, newVolunteer } from "@/lib/resume-types";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Sparkles, X, ArrowUp, ArrowDown } from "lucide-react";
import { AIAssistPanel } from "./ai-assist-panel";

export function ResumeEditor({
  content, onChange, resumeId, hasPublications, hasAwards, hasVolunteer,
}: {
  content: ResumeContent;
  onChange: (c: ResumeContent) => void;
  resumeId: string;
  hasPublications: boolean;
  hasAwards: boolean;
  hasVolunteer: boolean;
}) {
  const [ai, setAi] = useState<{ section: string; getText: () => string; setText: (v: string) => void } | null>(null);

  const updatePersonal = (patch: Partial<ResumeContent["personal"]>) => onChange({ ...content, personal: { ...content.personal, ...patch } });
  const updateSkills = (key: keyof ResumeContent["skills"], value: string[]) => onChange({ ...content, skills: { ...content.skills, [key]: value } });

  const defaultOpen = ["personal", "work", "education", "skills", "projects"];
  if (hasPublications || (content.publications?.length ?? 0) > 0) defaultOpen.push("publications");
  if (hasAwards || (content.awards?.length ?? 0) > 0) defaultOpen.push("awards");
  if (hasVolunteer || (content.volunteer?.length ?? 0) > 0) defaultOpen.push("volunteer");

  return (
    <>
      <Accordion type="multiple" defaultValue={defaultOpen} className="space-y-2">
        <AccordionItem value="personal" className="border rounded-md px-3">
          <AccordionTrigger>Personal Information</AccordionTrigger>
          <AccordionContent className="space-y-3">
            <Row><Field label="Full name"><Input value={content.personal.full_name} onChange={(e) => updatePersonal({ full_name: e.target.value })} /></Field>
              <Field label="Email"><Input value={content.personal.email} onChange={(e) => updatePersonal({ email: e.target.value })} /></Field></Row>
            <Row><Field label="Phone"><Input value={content.personal.phone ?? ""} onChange={(e) => updatePersonal({ phone: e.target.value || null })} /></Field>
              <Field label="Location"><Input value={content.personal.location ?? ""} onChange={(e) => updatePersonal({ location: e.target.value || null })} /></Field></Row>
            <Row><Field label="LinkedIn URL"><Input value={content.personal.linkedin_url ?? ""} onChange={(e) => updatePersonal({ linkedin_url: e.target.value || null })} /></Field>
              <Field label="Website / Portfolio"><Input value={content.personal.website ?? ""} onChange={(e) => updatePersonal({ website: e.target.value || null })} /></Field></Row>
            <Field label="Professional summary"><Textarea rows={3} value={content.personal.summary ?? ""} onChange={(e) => updatePersonal({ summary: e.target.value || null })} /></Field>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="work" className="border rounded-md px-3">
          <AccordionTrigger>Work Experience</AccordionTrigger>
          <AccordionContent className="space-y-3">
            {content.work_experience.map((e, i) => (
              <EntryCard key={e.id} onRemove={() => onChange({ ...content, work_experience: content.work_experience.filter((x) => x.id !== e.id) })}
                onMove={(dir) => onChange({ ...content, work_experience: move(content.work_experience, i, dir) })}>
                <Row><Field label="Company"><Input value={e.company} onChange={(ev) => updList(content, "work_experience", i, { company: ev.target.value }, onChange)} /></Field>
                  <Field label="Title"><Input value={e.title} onChange={(ev) => updList(content, "work_experience", i, { title: ev.target.value }, onChange)} /></Field></Row>
                <Row><Field label="Location"><Input value={e.location ?? ""} onChange={(ev) => updList(content, "work_experience", i, { location: ev.target.value || null }, onChange)} /></Field>
                  <div className="flex gap-2 flex-1">
                    <Field label="Start"><Input value={e.start_date} onChange={(ev) => updList(content, "work_experience", i, { start_date: ev.target.value }, onChange)} placeholder="Jan 2022" /></Field>
                    <Field label="End"><Input value={e.end_date ?? ""} disabled={e.is_current} onChange={(ev) => updList(content, "work_experience", i, { end_date: ev.target.value || null }, onChange)} placeholder="Dec 2023" /></Field>
                  </div></Row>
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={e.is_current} onCheckedChange={(v) => updList(content, "work_experience", i, { is_current: !!v, end_date: v ? null : e.end_date }, onChange)} /> I currently work here</label>
                <BulletsEditor bullets={e.bullets} onChange={(b) => updList(content, "work_experience", i, { bullets: b }, onChange)} onAI={(idx, get, set) => setAi({ section: "Work Experience", getText: get, setText: set })} />
              </EntryCard>
            ))}
            <Button variant="outline" size="sm" onClick={() => onChange({ ...content, work_experience: [...content.work_experience, newWork()] })}><Plus className="h-4 w-4" /> Add experience</Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="education" className="border rounded-md px-3">
          <AccordionTrigger>Education</AccordionTrigger>
          <AccordionContent className="space-y-3">
            {content.education.map((e, i) => (
              <EntryCard key={e.id} onRemove={() => onChange({ ...content, education: content.education.filter((x) => x.id !== e.id) })}
                onMove={(dir) => onChange({ ...content, education: move(content.education, i, dir) })}>
                <Row><Field label="Institution"><Input value={e.institution} onChange={(ev) => updList(content, "education", i, { institution: ev.target.value }, onChange)} /></Field>
                  <Field label="Degree"><Input value={e.degree} onChange={(ev) => updList(content, "education", i, { degree: ev.target.value }, onChange)} /></Field></Row>
                <Row><Field label="Field"><Input value={e.field} onChange={(ev) => updList(content, "education", i, { field: ev.target.value }, onChange)} /></Field>
                  <Field label="Location"><Input value={e.location ?? ""} onChange={(ev) => updList(content, "education", i, { location: ev.target.value || null }, onChange)} /></Field></Row>
                <Row><Field label="Start"><Input value={e.start_date} onChange={(ev) => updList(content, "education", i, { start_date: ev.target.value }, onChange)} /></Field>
                  <Field label="End"><Input value={e.end_date ?? ""} onChange={(ev) => updList(content, "education", i, { end_date: ev.target.value || null }, onChange)} /></Field></Row>
                <Row><Field label="GPA"><Input value={e.gpa ?? ""} onChange={(ev) => updList(content, "education", i, { gpa: ev.target.value || null }, onChange)} /></Field>
                  <Field label="Honors"><Input value={e.honors ?? ""} onChange={(ev) => updList(content, "education", i, { honors: ev.target.value || null }, onChange)} /></Field></Row>
                <Field label="Relevant courses (comma-separated)">
                  <Input value={(e.relevant_courses ?? []).join(", ")} onChange={(ev) => updList(content, "education", i, { relevant_courses: ev.target.value.split(",").map((s) => s.trim()).filter(Boolean) }, onChange)} />
                </Field>
              </EntryCard>
            ))}
            <Button variant="outline" size="sm" onClick={() => onChange({ ...content, education: [...content.education, newEducation()] })}><Plus className="h-4 w-4" /> Add education</Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="skills" className="border rounded-md px-3">
          <AccordionTrigger>Skills</AccordionTrigger>
          <AccordionContent className="space-y-3">
            <TagInput label="Technical Skills" tags={content.skills.technical} onChange={(v) => updateSkills("technical", v)} />
            <TagInput label="Languages" tags={content.skills.languages} onChange={(v) => updateSkills("languages", v)} />
            <TagInput label="Certifications" tags={content.skills.certifications} onChange={(v) => updateSkills("certifications", v)} />
            <TagInput label="Other" tags={content.skills.other} onChange={(v) => updateSkills("other", v)} />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="projects" className="border rounded-md px-3">
          <AccordionTrigger>Projects</AccordionTrigger>
          <AccordionContent className="space-y-3">
            {content.projects.map((e, i) => (
              <EntryCard key={e.id} onRemove={() => onChange({ ...content, projects: content.projects.filter((x) => x.id !== e.id) })}
                onMove={(dir) => onChange({ ...content, projects: move(content.projects, i, dir) })}>
                <Row><Field label="Project name"><Input value={e.name} onChange={(ev) => updList(content, "projects", i, { name: ev.target.value }, onChange)} /></Field>
                  <Field label="URL"><Input value={e.url ?? ""} onChange={(ev) => updList(content, "projects", i, { url: ev.target.value || null }, onChange)} /></Field></Row>
                <Row><Field label="Date"><Input value={e.date ?? ""} onChange={(ev) => updList(content, "projects", i, { date: ev.target.value || null }, onChange)} /></Field></Row>
                <Field label="Description"><Textarea rows={2} value={e.description ?? ""} onChange={(ev) => updList(content, "projects", i, { description: ev.target.value || null }, onChange)} /></Field>
                <BulletsEditor bullets={e.bullets} onChange={(b) => updList(content, "projects", i, { bullets: b }, onChange)} onAI={(idx, get, set) => setAi({ section: "Projects", getText: get, setText: set })} />
              </EntryCard>
            ))}
            <Button variant="outline" size="sm" onClick={() => onChange({ ...content, projects: [...content.projects, newProject()] })}><Plus className="h-4 w-4" /> Add project</Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="publications" className="border rounded-md px-3">
          <AccordionTrigger>Publications</AccordionTrigger>
          <AccordionContent className="space-y-3">
            {content.publications.map((e, i) => (
              <EntryCard key={e.id} onRemove={() => onChange({ ...content, publications: content.publications.filter((x) => x.id !== e.id) })}
                onMove={(dir) => onChange({ ...content, publications: move(content.publications, i, dir) })}>
                <Row><Field label="Title"><Input value={e.title} onChange={(ev) => updList(content, "publications", i, { title: ev.target.value }, onChange)} /></Field></Row>
                <Row><Field label="Journal / Conference"><Input value={e.journal ?? ""} onChange={(ev) => updList(content, "publications", i, { journal: ev.target.value || null }, onChange)} /></Field>
                  <Field label="Date"><Input value={e.date ?? ""} onChange={(ev) => updList(content, "publications", i, { date: ev.target.value || null }, onChange)} /></Field></Row>
                <Field label="URL"><Input value={e.url ?? ""} onChange={(ev) => updList(content, "publications", i, { url: ev.target.value || null }, onChange)} /></Field>
              </EntryCard>
            ))}
            <Button variant="outline" size="sm" onClick={() => onChange({ ...content, publications: [...content.publications, newPublication()] })}><Plus className="h-4 w-4" /> Add publication</Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="awards" className="border rounded-md px-3">
          <AccordionTrigger>Awards & Honors</AccordionTrigger>
          <AccordionContent className="space-y-3">
            {content.awards.map((e, i) => (
              <EntryCard key={e.id} onRemove={() => onChange({ ...content, awards: content.awards.filter((x) => x.id !== e.id) })}
                onMove={(dir) => onChange({ ...content, awards: move(content.awards, i, dir) })}>
                <Row><Field label="Title"><Input value={e.title} onChange={(ev) => updList(content, "awards", i, { title: ev.target.value }, onChange)} /></Field>
                  <Field label="Issuer"><Input value={e.issuer ?? ""} onChange={(ev) => updList(content, "awards", i, { issuer: ev.target.value || null }, onChange)} /></Field></Row>
                <Row><Field label="Date"><Input value={e.date ?? ""} onChange={(ev) => updList(content, "awards", i, { date: ev.target.value || null }, onChange)} /></Field></Row>
                <Field label="Description"><Textarea rows={2} value={e.description ?? ""} onChange={(ev) => updList(content, "awards", i, { description: ev.target.value || null }, onChange)} /></Field>
              </EntryCard>
            ))}
            <Button variant="outline" size="sm" onClick={() => onChange({ ...content, awards: [...content.awards, newAward()] })}><Plus className="h-4 w-4" /> Add award</Button>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="volunteer" className="border rounded-md px-3">
          <AccordionTrigger>Volunteer Experience</AccordionTrigger>
          <AccordionContent className="space-y-3">
            {content.volunteer.map((e, i) => (
              <EntryCard key={e.id} onRemove={() => onChange({ ...content, volunteer: content.volunteer.filter((x) => x.id !== e.id) })}
                onMove={(dir) => onChange({ ...content, volunteer: move(content.volunteer, i, dir) })}>
                <Row><Field label="Organization"><Input value={e.organization} onChange={(ev) => updList(content, "volunteer", i, { organization: ev.target.value }, onChange)} /></Field>
                  <Field label="Role"><Input value={e.role} onChange={(ev) => updList(content, "volunteer", i, { role: ev.target.value }, onChange)} /></Field></Row>
                <Row><Field label="Start"><Input value={e.start_date ?? ""} onChange={(ev) => updList(content, "volunteer", i, { start_date: ev.target.value || null }, onChange)} /></Field>
                  <Field label="End"><Input value={e.end_date ?? ""} onChange={(ev) => updList(content, "volunteer", i, { end_date: ev.target.value || null }, onChange)} /></Field></Row>
                <BulletsEditor bullets={e.bullets} onChange={(b) => updList(content, "volunteer", i, { bullets: b }, onChange)} onAI={(idx, get, set) => setAi({ section: "Volunteer", getText: get, setText: set })} />
              </EntryCard>
            ))}
            <Button variant="outline" size="sm" onClick={() => onChange({ ...content, volunteer: [...content.volunteer, newVolunteer()] })}><Plus className="h-4 w-4" /> Add volunteer role</Button>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {ai && (
        <AIAssistPanel
          open={!!ai}
          onOpenChange={(v) => !v && setAi(null)}
          section={ai.section}
          currentText={ai.getText()}
          resumeId={resumeId}
          onUse={(t) => { ai.setText(t); setAi(null); }}
        />
      )}
    </>
  );
}

function Row({ children }: { children: React.ReactNode }) { return <div className="flex flex-col sm:flex-row gap-2">{children}</div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex-1"><Label className="text-xs text-muted-foreground">{label}</Label>{children}</div>;
}
function EntryCard({ children, onRemove, onMove }: { children: React.ReactNode; onRemove: () => void; onMove: (dir: -1 | 1) => void }) {
  return (
    <div className="rounded-md border p-3 space-y-2 bg-card">
      <div className="flex justify-end gap-1">
        <Button variant="ghost" size="icon" onClick={() => onMove(-1)}><ArrowUp className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon" onClick={() => onMove(1)}><ArrowDown className="h-3 w-3" /></Button>
        <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this entry?")) onRemove(); }}><Trash2 className="h-3 w-3" /></Button>
      </div>
      {children}
    </div>
  );
}

function BulletsEditor({ bullets, onChange, onAI }: { bullets: string[]; onChange: (b: string[]) => void; onAI: (idx: number, get: () => string, set: (v: string) => void) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">Bullets</Label>
      {bullets.map((b, i) => (
        <div key={i} className="flex gap-1 items-center">
          <Textarea rows={2} value={b} onChange={(e) => { const c = [...bullets]; c[i] = e.target.value; onChange(c); }} />
          <div className="flex flex-col gap-1">
            <Button variant="ghost" size="icon" title="AI Assist" onClick={() => onAI(i, () => bullets[i], (v) => { const c = [...bullets]; c[i] = v; onChange(c); })}><Sparkles className="h-3 w-3" /></Button>
            <Button variant="ghost" size="icon" onClick={() => onChange(bullets.filter((_, k) => k !== i))}><X className="h-3 w-3" /></Button>
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...bullets, ""])}><Plus className="h-3 w-3" /> Add bullet</Button>
    </div>
  );
}

function TagInput({ label, tags, onChange }: { label: string; tags: string[]; onChange: (t: string[]) => void }) {
  const [val, setVal] = useState("");
  const add = (s: string) => {
    const parts = s.split(",").map((x) => x.trim()).filter(Boolean);
    if (parts.length) onChange([...tags, ...parts]);
    setVal("");
  };
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex flex-wrap gap-1 mb-1">
        {tags.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-full bg-secondary text-secondary-foreground px-2 py-0.5 text-xs">
            {t}<button type="button" onClick={() => onChange(tags.filter((_, k) => k !== i))}><X className="h-3 w-3" /></button>
          </span>
        ))}
      </div>
      <Input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(val); } }} onBlur={() => val && add(val)} onPaste={(e) => { const t = e.clipboardData.getData("text"); if (t.includes(",")) { e.preventDefault(); add(t); } }} placeholder="Type and press Enter" />
    </div>
  );
}

function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const c = [...arr];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}

function updList<K extends keyof ResumeContent>(content: ResumeContent, key: K, i: number, patch: Partial<any>, onChange: (c: ResumeContent) => void) {
  const arr = (content[key] as any[]).slice();
  arr[i] = { ...arr[i], ...patch };
  onChange({ ...content, [key]: arr } as ResumeContent);
}