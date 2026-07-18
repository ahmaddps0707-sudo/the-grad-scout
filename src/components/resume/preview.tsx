import type { ResumeContent } from "@/lib/resume-types";
import { DEFAULT_SECTION_ORDER } from "@/lib/resume-types";
import { useEffect, useRef, useState } from "react";

function fmtRange(a?: string | null, b?: string | null, cur?: boolean) {
  const end = cur ? "Present" : (b || "");
  return [a || "", end].filter(Boolean).join(" – ");
}

// A4 at 96dpi: 297mm ≈ 1122.5px. The print area is rendered at 1× scale.
const A4_PAGE_HEIGHT_PX = 1122.5;

function EntryHeader({ left, right }: { left: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-baseline">
      <div className="font-semibold flex-1 min-w-0">{left}</div>
      {right ? (
        <div
          className="text-xs text-slate-600"
          style={{ whiteSpace: "nowrap", flexShrink: 0, marginLeft: 16, textAlign: "right" }}
        >
          {right}
        </div>
      ) : null}
    </div>
  );
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
          <EntryHeader
            left={<>{e.title || "Title"} · <span className="font-normal">{e.company}</span></>}
            right={fmtRange(e.start_date, e.end_date, e.is_current)}
          />
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
          <EntryHeader left={e.institution} right={fmtRange(e.start_date, e.end_date)} />
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

  const areaRef = useRef<HTMLDivElement>(null);
  const [pageCount, setPageCount] = useState(1);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const recalc = () => {
      const h = el.scrollHeight;
      setPageCount(Math.max(1, Math.ceil(h / A4_PAGE_HEIGHT_PX)));
    };
    recalc();
    const ro = new ResizeObserver(recalc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [content]);

  return (
    <div ref={areaRef} className="relative mx-auto" style={{ width: "210mm" }}>
    <div id="resume-print-area" className={`bg-white text-slate-900 shadow-sm ${fontClass}`} style={{ width: "210mm", minHeight: "297mm", padding: "15mm 18mm", fontSize: "10.5pt", lineHeight: 1.35 }}>
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
              <EntryHeader left={pr.name} right={pr.date || undefined} />
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
              <EntryHeader
                left={<><span>{x.title}</span>{x.issuer && <>, {x.issuer}</>}</>}
                right={x.date || undefined}
              />
              {x.description && <div>{x.description}</div>}
            </div>
          ))}
        </Section>
      )}

      {content.volunteer.length > 0 && (
        <Section title="Volunteer Experience" accent={accent}>
          {content.volunteer.map((e) => (
            <div key={e.id} className="entry-block mb-2" style={{ pageBreakInside: "avoid" }}>
              <EntryHeader
                left={<>{e.role} · <span className="font-normal">{e.organization}</span></>}
                right={fmtRange(e.start_date, e.end_date)}
              />
              <ul className="list-disc ml-4 mt-1 text-xs">
                {e.bullets.filter(Boolean).map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          ))}
        </Section>
      )}
    </div>
      {Array.from({ length: Math.max(0, pageCount - 1) }, (_, i) => {
        const pageNum = i + 2;
        const top = A4_PAGE_HEIGHT_PX * (i + 1);
        return (
          <div
            key={pageNum}
            className="resume-page-break pointer-events-none absolute left-0 right-0 flex flex-col items-center"
            style={{ top: top - 10 }}
            aria-hidden
          >
            <div className="text-[10px] text-slate-400 leading-none mb-1">Page {pageNum}</div>
            <div className="w-full border-t border-dashed border-slate-300" />
          </div>
        );
      })}
      <style>{`@media print { .resume-page-break { display: none !important; } }`}</style>
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