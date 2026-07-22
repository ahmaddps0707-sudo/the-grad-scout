import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteUserEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { entryId: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Load the entry and verify ownership via RLS-scoped client
    const { data: entry, error: eErr } = await supabase
      .from("user_entries")
      .select("id, user_id, program_id, university_id")
      .eq("id", data.entryId)
      .maybeSingle();
    if (eErr) throw new Error(eErr.message);
    if (!entry || entry.user_id !== userId) throw new Error("Entry not found");

    const { program_id: programId, university_id: universityId } = entry;

    // 2. Delete status history for this entry (may be blocked by RLS; ignore errors)
    await supabase.from("entry_status_history").delete().eq("entry_id", entry.id);

    // 3. Delete the user_entries row itself
    const { error: delErr } = await supabase.from("user_entries").delete().eq("id", entry.id);
    if (delErr) throw new Error(delErr.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let deletedProgram = false;
    let deletedUniversity = false;

    // 4. If no remaining entries reference the program, cascade delete program + enrichment
    if (programId) {
      const { count: progRefs } = await supabaseAdmin
        .from("user_entries")
        .select("id", { count: "exact", head: true })
        .eq("program_id", programId);
      if ((progRefs ?? 0) === 0) {
        await Promise.all([
          supabaseAdmin.from("program_admissions").delete().eq("program_id", programId),
          supabaseAdmin.from("program_class_profile").delete().eq("program_id", programId),
          supabaseAdmin.from("program_funding").delete().eq("program_id", programId),
          supabaseAdmin.from("program_career_stats").delete().eq("program_id", programId),
          supabaseAdmin.from("program_research_sources").delete().eq("program_id", programId),
          supabaseAdmin.from("program_contacts").delete().eq("program_id", programId),
        ]);
        await supabaseAdmin.from("programs").delete().eq("id", programId);
        deletedProgram = true;
      }
    }

    // 5. If no remaining entries reference the university, delete city info + university
    if (universityId) {
      const { count: uniRefs } = await supabaseAdmin
        .from("user_entries")
        .select("id", { count: "exact", head: true })
        .eq("university_id", universityId);
      if ((uniRefs ?? 0) === 0) {
        // program_city_info FKs to programs with ON DELETE CASCADE, so it's already gone.
        await supabaseAdmin.from("universities").delete().eq("id", universityId);
        deletedUniversity = true;
      }
    }

    return { ok: true, deletedProgram, deletedUniversity };
  });