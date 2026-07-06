import type { ResumeContent } from "@/lib/resume-types";
import { DEFAULT_SECTION_ORDER } from "@/lib/resume-types";

function fmtRange(a?: string | null, b?: string | null, cur?: boolean) {
  const end = cur ? "Present" : (b || "");
  return [a || "", end].filter(Boolean).join(" – ");
}

export function ResumePreview({ content, template }: { content: ResumeContent; template?: string }) {
  const p = content.personal;
  const fontClass = "font-sans";
  const accent = "text-slate-900 border-slate-900";
  void template;
  const order = (content.section_order && content.section_order.length ? content.section_order : DEFAULT_SECTION_ORDER);

  const workBlock = content.work_experience.length > 0 && (
    <Section key="work" title="Experience" accent={accent}>
      {content.work_experience.map((e) => (
        <div key={e.id} className="entry-block mb-2" style={{ pageBreakInside: "avoid" }}>
          <div className="flex justify-between items-baseline">
            <div className="font-semibold">{e.title || "Title"} · <span className="font-normal">{e.company}</span></div>
            <div className="text-xs text-slate-600">{fmtRange(e.start_date, e.end_date, e.is_current)}</div>
          </div>
          {e.location && <div className="text-xs text-slate-600">{e.location}</div>}
          <ul className="list-disc ml-4 mt-1 text-xs">
            {e.bullets.filter(Boolean).map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      ))}
    </Section>
  );

  const eduBlock = content.education.length > 0 && (
    <Section key="education" title="Education" accent={accent}>
      {content.education.map((e) => (
        <div key={e.id} className="entry-block mb-2" style={{ pageBreakInside: "avoid" }}>
          <div className="flex justify-between items-baseline">
            <div className="font-semibold">{e.institution}</div>
            <div className="text-xs text-slate-600">{fmtRange(e.start_date, e.end_date)}</div>
          </div>
          <div className="text-xs">{[e.degree, e.field].filter(Boolean).join(", ")}{e.gpa ? ` · GPA ${e.gpa}` : ""}</div>
          {e.honors && <div className="text-xs italic">{e.honors}</div>}
          {e.relevant_courses && e.relevant_courses.length > 0 && (
            <div className="text-xs text-slate-700">Relevant: {e.relevant_courses.join(", ")}</div>
          )}
        </div>
      ))}
    </Section>
  );

  const orderedBlocks = order.map((k) => (k === "work" ? workBlock : eduBlock));

  return (
    <div id="resume-print-area" className={`bg-white text-slate-900 shadow-sm mx-auto ${fontClass}`} style={{ width: "210mm", minHeight: "297mm", padding: "15mm 18mm", fontSize: "10.5pt", lineHeight: 1.35 }}>
      <header className={`pb-2 border-b mb-3 ${accent} text-center`}>
        <div className={`text-2xl font-bold ${accent}`}>{p.full_name || "Your Name"}</div>
        <div className="text-xs text-slate-600 mt-1">
          {[p.email, p.phone, p.location, p.linkedin_url, p.website].filter(Boolean).join(" · ")}
        </div>
        {p.summary && <div className="mt-2 text-xs text-left">{p.summary}</div>}
      </header>

      {orderedBlocks}

      {(content.skills.technical.length + content.skills.languages.length + content.skills.certifications.length + content.skills.other.length) > 0 && (
        <Section title="Skills" accent={accent}>
          <div className="entry-block text-xs space-y-0.5" style={{ pageBreakInside: "avoid" }}>
            {content.skills.technical.length > 0 && <div><span className="font-semibold">Technical:</span> {content.skills.technical.join(", ")}</div>}
            {content.skills.languages.length > 0 && <div><span className="font-semibold">Languages:</span> {content.skills.languages.join(", ")}</div>}
            {content.skills.certifications.length > 0 && <div><span className="font-semibold">Certifications:</span> {content.skills.certifications.join(", ")}</div>}
            {content.skills.other.length > 0 && <div><span className="font-semibold">Other:</span> {content.skills.other.join(", ")}</div>}
          </div>
        </Section>
      )}

      {content.projects.length > 0 && (
        <Section title="Projects" accent={accent}>
          {content.projects.map((pr) => (
            <div key={pr.id} className="entry-block mb-2" style={{ pageBreakInside: "avoid" }}>
              <div className="flex justify-between items-baseline">
                <div className="font-semibold">{pr.name}</div>
                {pr.date && <div className="text-xs text-slate-600">{pr.date}</div>}
              </div>
              {pr.description && <div className="text-xs">{pr.description}</div>}
              <ul className="list-disc ml-4 mt-1 text-xs">
                {pr.bullets.filter(Boolean).map((b, i) => <li key={i}>{b}</li>)}
              </ul>
              {pr.url && <div className="text-xs text-slate-600">{pr.url}</div>}
            </div>
          ))}
        </Section>
      )}

      {content.publications.length > 0 && (
        <Section title="Publications" accent={accent}>
          {content.publications.map((x) => (
            <div key={x.id} className="entry-block text-xs mb-1" style={{ pageBreakInside: "avoid" }}>
              <span className="font-semibold">{x.title}</span>
              {x.journal && <>. <em>{x.journal}</em></>}
              {x.date && <>, {x.date}</>}
            </div>
          ))}
        </Section>
      )}

      {content.awards.length > 0 && (
        <Section title="Awards & Honors" accent={accent}>
          {content.awards.map((x) => (
            <div key={x.id} className="entry-block text-xs mb-1" style={{ pageBreakInside: "avoid" }}>
              <span className="font-semibold">{x.title}</span>
              {x.issuer && <>, {x.issuer}</>}
              {x.date && <> · {x.date}</>}
              {x.description && <div>{x.description}</div>}
            </div>
          ))}
        </Section>
      )}

      {content.volunteer.length > 0 && (
        <Section title="Volunteer Experience" accent={accent}>
          {content.volunteer.map((e) => (
            <div key={e.id} className="entry-block mb-2" style={{ pageBreakInside: "avoid" }}>
              <div className="flex justify-between items-baseline">
                <div className="font-semibold">{e.role} · <span className="font-normal">{e.organization}</span></div>
                <div className="text-xs text-slate-600">{fmtRange(e.start_date, e.end_date)}</div>
              </div>
              <ul className="list-disc ml-4 mt-1 text-xs">
                {e.bullets.filter(Boolean).map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <section className="mt-3" style={{ pageBreakInside: "auto" }}>
      <h2 className={`text-sm font-bold uppercase tracking-wider border-b ${accent} pb-0.5 mb-1.5 text-left`} style={{ pageBreakAfter: "avoid" }}>{title}</h2>
      {children}
    </section>
  );
}