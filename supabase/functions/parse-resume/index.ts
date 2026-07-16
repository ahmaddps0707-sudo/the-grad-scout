// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { CORS_HEADERS, parseJsonLoose } from "../_shared/lovable-ai.ts";

const SCHEMA = `{
  "personal": { "full_name": string, "email": string, "phone": string or null, "linkedin_url": string or null, "location": string or null, "website": string or null, "summary": string or null },
  "work_experience": [{ "id": string, "company": string, "title": string, "location": string or null, "start_date": string, "end_date": string or null, "is_current": boolean, "bullets": [string] }],
  "education": [{ "id": string, "institution": string, "degree": string, "field": string, "location": string or null, "start_date": string, "end_date": string or null, "gpa": string or null, "honors": string or null, "relevant_courses": [string] or null }],
  "skills": { "technical": [string], "languages": [string], "certifications": [string], "other": [string] },
  "projects": [{ "id": string, "name": string, "description": string or null, "bullets": [string], "url": string or null, "date": string or null }],
  "publications": [{ "id": string, "title": string, "journal": string or null, "date": string or null, "url": string or null }],
  "awards": [{ "id": string, "title": string, "issuer": string or null, "date": string or null, "description": string or null }],
  "volunteer": [{ "id": string, "organization": string, "role": string, "start_date": string or null, "end_date": string or null, "bullets": [string] }]
}`;

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  let resumeId: string | null = null;
  try {
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const { resume_id, user_id, file_path } = await req.json();
    if (!resume_id || !user_id || !file_path) throw new Error("resume_id, user_id, file_path required");
    resumeId = resume_id;

    await admin.from("resumes").update({ parse_status: "parsing" }).eq("id", resume_id);

    const { data: file, error: dlErr } = await admin.storage.from("resumes").download(file_path);
    if (dlErr || !file) throw new Error(`Download failed: ${dlErr?.message}`);

    const buf = await file.arrayBuffer();
    const b64 = bufferToBase64(buf);
    const isDocx = file_path.toLowerCase().endsWith(".docx");
    const mime = isDocx ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf";

    const system = "You are a resume parsing assistant. Extract all information from the uploaded resume into structured JSON. Preserve the user's exact wording for all bullet points and descriptions — do not rephrase, improve, or summarize any content. Your job is to extract, not rewrite. If a field is not present in the resume, use null. For dates, use the format as written in the resume (e.g. 'May 2022', '2021-2023', 'Present'). For any array item, generate a random uuid for the 'id' field.";

    const userText = `Parse this resume and return ONLY a JSON object matching exactly the schema provided. No other text, no markdown fences. Schema: ${SCHEMA}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } },
            ],
          },
        ],
        max_completion_tokens: 8192,
      }),
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(`AI ${res.status}: ${t}`);
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    if (!content) throw new Error("Empty AI response");

    let parsed: any;
    try {
      parsed = parseJsonLoose(content);
    } catch (e) {
      throw new Error(`JSON parse failed: ${(e as Error).message}`);
    }

    // Ensure array/object shape defaults so the editor never crashes
    const safe = {
      personal: parsed.personal ?? { full_name: "", email: "", phone: null, linkedin_url: null, location: null, website: null, summary: null },
      work_experience: Array.isArray(parsed.work_experience) ? parsed.work_experience : [],
      education: Array.isArray(parsed.education) ? parsed.education : [],
      skills: parsed.skills ?? { technical: [], languages: [], certifications: [], other: [] },
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      publications: Array.isArray(parsed.publications) ? parsed.publications : [],
      awards: Array.isArray(parsed.awards) ? parsed.awards : [],
      volunteer: Array.isArray(parsed.volunteer) ? parsed.volunteer : [],
    };

    await admin.from("resumes").update({ content: safe, parse_status: "done", updated_at: new Date().toISOString() }).eq("id", resume_id);

    return new Response(JSON.stringify({ ok: true }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("parse-resume error:", e);
    if (resumeId) {
      await admin.from("resumes").update({ parse_status: "failed" }).eq("id", resumeId);
    }
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
});