// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { CORS_HEADERS } from "../_shared/lovable-ai.ts";
import { PAID_LIMITS, ensureUsageWindow, isPaid } from "../_shared/limits.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });

    const { resume_id, section, accepted_suggestion } = await req.json();
    if (!resume_id || !section || !accepted_suggestion) throw new Error("resume_id, section, accepted_suggestion required");

    let { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).single();
    if (!profile) throw new Error("profile missing");
    profile = await ensureUsageWindow(admin, profile);
    if (!isPaid(profile)) {
      return new Response(JSON.stringify({ code: "PAID_ONLY", reason: "paid_only", error: "Resume builder is a Pro feature." }), { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }
    if ((profile.ai_bullets_used ?? 0) >= PAID_LIMITS.ai_bullets) {
      return new Response(JSON.stringify({ code: "ai_bullets_limit_reached", reason: "ai_bullets_limit_reached", error: `You've reached ${PAID_LIMITS.ai_bullets} AI bullet acceptances for this billing period.` }), { status: 403, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    // Record accepted suggestion on the most recent row for this section
    const { data: last } = await admin.from("resume_ai_suggestions")
      .select("id").eq("user_id", user.id).eq("resume_id", resume_id).eq("section", section)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (last?.id) {
      await admin.from("resume_ai_suggestions").update({ accepted_suggestion }).eq("id", last.id);
    }

    await admin.from("profiles").update({ ai_bullets_used: (profile.ai_bullets_used ?? 0) + 1 }).eq("id", user.id);
    return new Response(JSON.stringify({ ok: true, ai_bullets_used: (profile.ai_bullets_used ?? 0) + 1 }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("resume-ai-accept error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  }
});