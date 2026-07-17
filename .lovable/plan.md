## Plan

1. **Upgrade live web research pipeline**
   - Extend the shared Firecrawl helper beyond search snippets to support scraping live pages and returning markdown, title, status code, and source URL.
   - Add URL normalization/deduping and link validation so 404/410/broken pages are excluded before saving.

2. **Make enrichment source-first instead of model-first**
   - Update `enrich-university` to first search the live web for official university/program pages, admissions pages, tuition/funding pages, class profile pages, career outcomes pages, and ranking sources.
   - Scrape the best live pages and pass the scraped content to Gemini 3.5 Flash as grounded context.
   - Change the prompt so Gemini can only extract facts from the provided scraped sources and must return `null` when a value is not present.

3. **Validate research source links before storing**
   - Only write `program_research_sources` URLs that were successfully found/scraped and are not dead links.
   - Prefer official university URLs; allow ranking/publication URLs only for ranking fields.
   - Store source URLs tied to the data actually used, not model-invented citations.

4. **Refresh all detail tabs from grounded data**
   - Continue writing structured results into the existing tables for Overview, Admissions, Class Profile, Tuition/Funding, City, and Career Outcomes.
   - Ensure stale values are overwritten with current scraped values or `null` if not verifiable.

5. **Improve failure behavior**
   - If live search/scrape finds too little evidence, return a clear partial-data result instead of saving hallucinated data.
   - Add logging that separates search failures, scrape failures, dead links, and model parse failures.

## Technical details

- Keep using `google/gemini-3.5-flash` through the existing Lovable AI helper.
- Use the existing Firecrawl connector gateway path because this project’s Firecrawl connection is gateway-backed.
- Avoid scraping LinkedIn for university enrichment; this is for official program research pages and trusted public ranking/career sources.
- No database schema changes are expected unless we decide later to store per-field source attribution.