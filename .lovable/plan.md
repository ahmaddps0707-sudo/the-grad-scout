## Remove `website_url` homepage fallback from `enrich-university`

Drop the request-body `website_url` entirely. `storedProgramUrl` (from `programs.program_url`) becomes the only authoritative start URL; if it's missing, `gatherLiveSources` falls through to blind discovery search (existing behavior).

### Changes — `supabase/functions/enrich-university/index.ts`

1. **L412** — stop destructuring `website_url`:
   ```ts
   const { program_id, university_name, program_name } = await req.json();
   ```

2. **L449–455** — remove `effectiveWebsiteUrl`; pass `null` as `websiteUrl` to `gatherLiveSources`:
   ```ts
   const storedProgramUrl = (existing as any)?.program_url ?? null;
   const gathered = await gatherLiveSources(
     university_name,
     program_name,
     null,
     storedProgramUrl,
   );
   ```

3. **L467** — remove the `Official website:` line from the prompt (it now always resolves to `"unknown"`):
   ```ts
   const user = `Research this master's program using ONLY the live scraped source content below:
   University: ${university_name}
   Program: ${program_name}
   
   LIVE SOURCES:
   ...
   ```

4. Leave `gatherLiveSources`'s `websiteUrl` parameter in place — it's still valid as an optional argument, just always called with `null`. `primaryUrl = programUrl || websiteUrl` then reduces to `programUrl`, and the `!mainDoc` blind-discovery branch (L226–236) handles the missing-URL case.

### Callers — no code change required
`src/routes/_authenticated/university.$id.tsx` L75, L111, L128 pass `website_url` in the invoke body. Removing it from the handler makes those fields inert; they can stay or be cleaned up later. Not touching them per "precise fix only".

### Verification
After the edit, `rg website_url supabase/functions/enrich-university/index.ts` should return zero matches.