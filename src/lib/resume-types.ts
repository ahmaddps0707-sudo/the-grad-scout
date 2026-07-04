export type ResumeContent = {
  personal: {
    full_name: string;
    email: string;
    phone: string | null;
    linkedin_url: string | null;
    location: string | null;
    website: string | null;
    summary: string | null;
  };
  work_experience: WorkEntry[];
  education: EducationEntry[];
  skills: { technical: string[]; languages: string[]; certifications: string[]; other: string[] };
  projects: ProjectEntry[];
  publications: PublicationEntry[];
  awards: AwardEntry[];
  volunteer: VolunteerEntry[];
};

export type WorkEntry = {
  id: string;
  company: string;
  title: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  bullets: string[];
};
export type EducationEntry = {
  id: string;
  institution: string;
  degree: string;
  field: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  gpa: string | null;
  honors: string | null;
  relevant_courses: string[] | null;
};
export type ProjectEntry = {
  id: string;
  name: string;
  description: string | null;
  bullets: string[];
  url: string | null;
  date: string | null;
};
export type PublicationEntry = {
  id: string;
  title: string;
  journal: string | null;
  date: string | null;
  url: string | null;
};
export type AwardEntry = {
  id: string;
  title: string;
  issuer: string | null;
  date: string | null;
  description: string | null;
};
export type VolunteerEntry = {
  id: string;
  organization: string;
  role: string;
  start_date: string | null;
  end_date: string | null;
  bullets: string[];
};

export const emptyContent = (): ResumeContent => ({
  personal: { full_name: "", email: "", phone: null, linkedin_url: null, location: null, website: null, summary: null },
  work_experience: [],
  education: [],
  skills: { technical: [], languages: [], certifications: [], other: [] },
  projects: [],
  publications: [],
  awards: [],
  volunteer: [],
});

export const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export const newWork = (): WorkEntry => ({ id: uid(), company: "", title: "", location: null, start_date: "", end_date: null, is_current: false, bullets: [""] });
export const newEducation = (): EducationEntry => ({ id: uid(), institution: "", degree: "", field: "", location: null, start_date: "", end_date: null, gpa: null, honors: null, relevant_courses: null });
export const newProject = (): ProjectEntry => ({ id: uid(), name: "", description: null, bullets: [""], url: null, date: null });
export const newPublication = (): PublicationEntry => ({ id: uid(), title: "", journal: null, date: null, url: null });
export const newAward = (): AwardEntry => ({ id: uid(), title: "", issuer: null, date: null, description: null });
export const newVolunteer = (): VolunteerEntry => ({ id: uid(), organization: "", role: "", start_date: null, end_date: null, bullets: [""] });

export function isMostlyEmpty(c: ResumeContent): boolean {
  return !c.personal?.full_name && (c.work_experience?.length ?? 0) === 0 && (c.education?.length ?? 0) === 0;
}

export function nextVersionName(existing: string[]): string {
  let max = 0;
  for (const n of existing) {
    const m = /^Version\s+(\d+)$/i.exec(n?.trim() ?? "");
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `Version ${max + 1}`;
}