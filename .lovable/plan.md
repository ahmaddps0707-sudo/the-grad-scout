## 1. Fix "Discovery complete" showing 0 new programs

**Root cause (confirmed from edge logs):** every discovered program on recent runs is discarded by the country validator — the model keeps returning UK / Australia programs while the user's `target_countries` does not include them. The `discover-universities` search queries are hardcoded to `.edu`, `.ac.uk`, `.edu.au` regardless of the user's preferences, so the LLM has no evidence for the countries the user actually wants, proposes off-country matches, and the final validator (added last turn) rightly discards them → 0 inserts → generic toast.

Clarification on "shared" data: `universities` and `programs` are single global tables, but in practice each user's discover run creates rows tailored to their profile, so most rows are effectively per-user. The delete logic below preserves anything another user is still tracking.

**Edits — `supabase/functions/discover-universities/index.ts`:**
- Build search queries from `profile.target_countries`. Map each country to its academic TLD(s): US → `site:.edu`, UK → `site:.ac.uk`, Australia → `site:.edu.au`, Canada → `site:.ca`, Germany → `site:.de`, Netherlands → `site:.nl`, etc. Fallback (no target countries): keep the current generic query plus `.edu`.
- Always include one generic query with the country names spelled out (`"master's [major] in [country] admissions official"`) per target country, so non-TLD-tagged programs still surface.
- Return the same array shape; validator stays unchanged.

**Edits — `src/routes/_authenticated/dashboard.tsx`:**
- When the poll completes with `added === 0`, keep `lastRunCount = 0` (already does) but change the toast from success to `toast.info("No new matches — try broadening your preferences in Settings.")`. The existing `LowResultsBanner` already renders on 0.

## 2. Delete a university from the dashboard

Add a small "Delete" action on each `EntryCard` (trash icon in the icon row, or in an overflow menu next to the status dropdown) → confirmation `AlertDialog` → cascade delete.

**Deletion rules (per-user safe, since tables are technically shared):**
1. Always delete the caller's `user_entries` row.
2. If no other `user_entries` row still references the same `program_id`, hard delete the program and its enrichment: `program_admissions`, `program_class_profile`, `program_funding`, `program_career_stats`, `program_research_sources`, `program_contacts`, and the program row itself.
3. If no other `user_entries` row still references the same `university_id` (after step 2), hard delete `program_city_info` for that university and the `universities` row.
4. Never touch `user_saved_contacts` (kept — still shows on `/contacts`), `forum_posts`, `forum_comments`, `forum_likes`, or `forum_flags` (kept — foreign keys stay pointed at the deleted university id; the forum tab already handles missing joins).
5. Also delete related `entry_status_history` rows for the caller's entry.

**Implementation — new server-side function** (encapsulate the cascade so RLS/ownership is enforced in one place):

New file `src/utils/entries.functions.ts`:
```ts
export const deleteUserEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { entryId: string }) => i)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // 1. Load entry, verify ownership
    // 2. Delete entry_status_history for entry
    // 3. Delete the user_entries row (RLS gates by user_id)
    // 4. Count remaining user_entries for program_id → if 0, delete program + enrichment via admin client
    // 5. Count remaining user_entries for university_id → if 0, delete university + program_city_info
  });
```
- Uses `requireSupabaseAuth` to verify the caller and confirm they own the entry (`entry.user_id === userId`).
- Once ownership is confirmed, dynamically imports `supabaseAdmin` to perform the program/university cascade (since RLS on those tables blocks writes from `authenticated`).
- Returns `{ deletedProgram: boolean, deletedUniversity: boolean }` so the client can show an accurate toast.

**Edits — `src/routes/_authenticated/dashboard.tsx`:**
- Add trash icon button (using `Trash2` from `lucide-react`) in `EntryCard`'s icon row, guarded by an `AlertDialog` ("Delete this university? This removes the program and all its research data from your dashboard.").
- Wire to `useServerFn(deleteUserEntry)`. On success: optimistic remove from `entries`, `toast.success("Deleted")`.

## Technical notes

- No schema migration required — deletes only.
- No changes to forum, `user_saved_contacts`, resume, or contacts features.
- Discover run counter continues to increment even when 0 results are inserted (unchanged) — matches current behavior; happy to change if you'd prefer 0-result runs not to consume a run.
