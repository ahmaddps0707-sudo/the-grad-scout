// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { CORS_HEADERS, callLovableAI, parseJsonLoose } from "../_shared/lovable-ai.ts";
import { PAID_LIMITS, ensureUsageWindow, isPaid } from "../_shared/limits.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

    const { resume_id, section, raw_input } = await req.json();
    if (!resume_id || !section) throw new Error("resume_id and section required");
    const input = String(raw_input ?? "").trim();

    // Resume builder is a paid-only feature. Free users must upgrade.
    let { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).single();
    if (!profile) throw new Error("profile missing");
    profile = await ensureUsageWindow(admin, profile);
    if (!isPaid(profile)) {
      return new Response(JSON.stringify({ code: "PAID_ONLY", reason: "paid_only", error: "Resume builder is a Pro feature. Upgrade for AI writing assistance." }), {
        status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }
    if ((profile.ai_bullets_used ?? 0) >= PAID_LIMITS.ai_bullets) {
      return new Response(JSON.stringify({ code: "ai_bullets_limit_reached", reason: "ai_bullets_limit_reached", error: `You've reached ${PAID_LIMITS.ai_bullets} AI bullet acceptances for this billing period.` }), {
        status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const system = "You are a resume writing assistant helping a master's degree applicant strengthen their resume bullet points. Your job is to rephrase and improve what the user has written — you must only work with the facts and details the user has provided. Never add metrics, percentages, numbers, or achievements that the user did not mention. Never fabricate context. If the user's input is vague, return suggestions that are cleaner and stronger in structure, not more specific in claimed impact. Every bullet must follow the pattern: strong action verb + what you did + result or context if provided by the user. Keep each bullet under 2 lines.";
    const user_prompt = `Section: ${section}\nThe user has written: "${input}"\n\nReturn exactly 3 alternative bullet point versions. Respond with ONLY a JSON array of 3 strings, no other text: ["bullet 1", "bullet 2", "bullet 3"]`;

    let raw: string;
    try {
      raw = await callLovableAI({ apiKey, system, user: user_prompt, model: "google/gemini-3.5-flash", maxTokens: 1024 });
    } catch (e) {
      const msg = (e as Error).message;
      if (/rate limit/i.test(msg)) return new Response(JSON.stringify({ error: "Too many requests — please wait a moment and try again." }), { status: 429, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
      throw e;
    }

    let suggestions: string[] = [];
    try {
      const arr = parseJsonLoose(raw);
      if (Array.isArray(arr)) suggestions = arr.filter((s) => typeof s === "string").slice(0, 3);
    } catch { /* handled below */ }

    if (suggestions.length === 0) {
      return new Response(JSON.stringify({ error: "Couldn't generate suggestions right now — try again in a moment." }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    await admin.from("resume_ai_suggestions").insert({
      user_id: user.id, resume_id, section, raw_input: input, suggestions,
    });
    // Do NOT increment ai_bullets_used here — increment on accept (see resume-ai-accept).

    return new Response(JSON.stringify({ suggestions }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("resume-ai-assist error:", e);
    return new Response(JSON.stringify({ error: "Couldn't generate suggestions right now — try again in a moment." }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
});