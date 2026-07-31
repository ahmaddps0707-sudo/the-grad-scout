import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const AddManualEntrySchema = z.object({
  universityName: z.string().trim().min(1).max(200),
  programName: z.string().trim().min(1).max(200),
  websiteUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
});

/**
 * Creates (or reuses) a shared university/program catalog row and adds it to the
 * caller's pipeline. Catalog tables are service-role-only, so all writes happen
 * here after the caller has been authenticated and the input validated.
 */
export const addManualEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AddManualEntrySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    const uniName = data.universityName.trim();
    const progName = data.programName.trim();
    const website = data.websiteUrl ? data.websiteUrl.trim() : null;

    const { data: existingUni } = await supabaseAdmin
      .from("universities")
      .select("id")
      .ilike("name", uniName)
      .maybeSingle();

    let universityId = existingUni?.id;
    if (!universityId) {
      const { data: newUni, error } = await supabaseAdmin
        .from("universities")
        .insert({ name: uniName, website_url: website })
        .select("id")
        .single();
      if (error) throw new Error("Could not add university");
      universityId = newUni.id;
    }

    const { data: existingProg } = await supabaseAdmin
      .from("programs")
      .select("id")
      .eq("university_id", universityId)
      .ilike("name", progName)
      .maybeSingle();

    let programId = existingProg?.id;
    if (!programId) {
      const { data: newProg, error } = await supabaseAdmin
        .from("programs")
        .insert({ university_id: universityId, name: progName, degree_level: "masters" })
        .select("id")
        .single();
      if (error) throw new Error("Could not add program");
      programId = newProg.id;
    }

    const { error: entryError } = await context.supabase.from("user_entries").insert({
      user_id: userId,
      university_id: universityId,
      program_id: programId,
      status: "planning",
      source: "manual",
      score: 50,
    });
    if (entryError && !entryError.message.includes("duplicate")) {
      throw new Error("Could not add to your pipeline");
    }

    return { universityId, programId };
  });