// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { callAnthropic, CORS_HEADERS, extractFinalText, stripFences } from "../_shared/anthropic.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");
    const { program_id, university_name, program_name, website_url } = await req.json();
    if (!program_id || !university_name || !program_name) throw new Error("program_id, university_name, program_name required");

    const system = "You are a graduate admissions research assistant. Research the specific program given using web search. Only return values you can verify from current sources — use null for anything you cannot confirm. Do not estimate or guess numeric fields.";

    const user = `University: ${university_name}. Program: ${program_name}. Website: ${website_url ?? "unknown"}.

Find current admissions deadlines, requirements, class profile, and funding information. Respond with ONLY this JSON shape, no other text:

{
  "deadline_type": "fixed" | "rolling" | "tbd",
  "deadlines": [{"round": string, "date": string or null}],
  "required_materials": [string],
  "test_requirement_status": string,
  "application_fee": number or null,
  "application_fee_currency": string or null,
  "avg_gre": number or null, "avg_gmat": number or null,
  "avg_gpa": number or null, "avg_ielts": number or null,
  "avg_toefl": number or null, "class_size": number or null,
  "intl_pct": number or null,
  "tuition_amount": number or null, "tuition_currency": string or null,
  "ga_ta_availability": string or null,
  "est_accommodation_low": number or null,
  "est_accommodation_high": number or null,
  "sources": [string]
}`;

    const resp = await callAnthropic({ apiKey, system, user, maxTokens: 3000, maxWebSearches: 5 });
    const raw = extractFinalText(resp);
    let data: any;
    try {
      data = JSON.parse(stripFences(raw));
    } catch (e) {
      throw new Error(`Failed to parse model output: ${(e as Error).message}. Raw: ${raw.slice(0, 300)}`);
    }

    await admin.from("program_admissions").upsert({
      program_id,
      deadline_type: data.deadline_type ?? null,
      deadlines: data.deadlines ?? [],
      required_materials: data.required_materials ?? [],
      test_requirement_status: data.test_requirement_status ?? null,
      application_fee: data.application_fee ?? null,
      application_fee_currency: data.application_fee_currency ?? null,
      updated_at: new Date().toISOString(),
    });

    await admin.from("program_class_profile").upsert({
      program_id,
      avg_gre: data.avg_gre,
      avg_gmat: data.avg_gmat,
      avg_gpa: data.avg_gpa,
      avg_ielts: data.avg_ielts,
      avg_toefl: data.avg_toefl,
      class_size: data.class_size,
      intl_pct: data.intl_pct,
      updated_at: new Date().toISOString(),
    });

    await admin.from("program_funding").upsert({
      program_id,
      tuition_amount: data.tuition_amount,
      tuition_currency: data.tuition_currency,
      ga_ta_availability: data.ga_ta_availability,
      est_accommodation_low: data.est_accommodation_low,
      est_accommodation_high: data.est_accommodation_high,
      updated_at: new Date().toISOString(),
    });

    await admin.from("programs").update({ last_verified_at: new Date().toISOString() }).eq("id", program_id);

    if (Array.isArray(data.sources)) {
      // Replace sources to keep them current
      await admin.from("program_research_sources").delete().eq("program_id", program_id);
      for (const url of data.sources) {
        if (typeof url === "string" && url.trim()) {
          await admin.from("program_research_sources").insert({ program_id, url });
        }
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  } catch (e) {
    console.error("enrich-university error", e);
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { ...CORS_HEADERS, "content-type": "application/json" },
    });
  }
});