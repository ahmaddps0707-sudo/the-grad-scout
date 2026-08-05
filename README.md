# The Grad Scout

Build "Admitly" — a subscription-based web app that helps international 

students research master's programs, score them against their profile, 

and track their applications in one place.

TECH

Use the native Supabase integration for auth, database, and storage.

React + Tailwind frontend.

DESIGN DIRECTION

Clean, modern, and trustworthy — closer to a fintech dashboard than a 

playful startup app, since this audience is making high-stakes academic 

and financial decisions. Deep navy/indigo as the primary color, warm 

neutral background (off-white, not stark white), one accent color used 

sparingly for scores/status highlights. Card-based layouts, generous 

whitespace, clear type hierarchy. Avoid generic purple-gradient SaaS 

templates. Should feel calm and credible, not flashy.

BUILD THESE SCREENS:

1. AUTH

Email/password + Google sign-in via Supabase Auth. Require email 

verification before the user can reach the dashboard.

2. ONBOARDING WIZARD (multi-step, shown once after signup, editable later)

Step through these fields, with a progress indicator:

- Target degree level (default to Master's only for now)

- Desired major / field of study

- Desired country (multi-select)

- Target university tier (Top 10 / Top 50 / Top 100 / No preference)

- Funding preference (Fully funded only / Partial OK / Self-funded OK)

- Budget ceiling + currency

- Current GPA

- Test scores: GRE, GMAT, IELTS, TOEFL (all optional, with a "haven't 

  taken yet" option per test)

- Years of work experience

- Target intake term + year

Allow "skip for now" on non-critical fields. Autosave progress so a user 

can leave and resume. On completion, kick off the research flow 

described below and show a loading state ("Researching your matches...") 

until the first 5 results are ready, then route to /dashboard.

3. DASHBOARD (/dashboard)

- Header showing total universities tracked, a "Discover More" button, 

  and a "+ Add University" button that opens a manual-entry form 

  (university name, program name, website URL).

- Quick-filter chips: Favorites, Liked, Applied, Offers.

- Full status filter bar with these statuses: Scored, Planning to Apply, 

  In Review, Application In Progress, Applied, Interview, Offer Received, 

  Rejected, Waitlisted, Enrolled, Archived.

- Grid/list of university cards. Each card shows: university name, 

  program name, QS ranking, location, website link, a 0-100 match score 

  badge, like/dislike/favorite icons, and a status dropdown that updates 

  the entry's status without leaving the page.

- Sort control: Score (default), QS Rank, Recently Updated, Deadline.

- Empty state when no entries exist yet.

- Initial research run and every "Discover More" click should each 

  return exactly 5 new universities, not more — keep batches small and 

  fast rather than one large list.

4. UNIVERSITY DETAIL PAGE (/university/:id)

Opened from a dashboard card. Sticky header repeats the card info plus 

the same status dropdown. Below it, tabs:

- Overview: program description, a "fit rationale" text block (use the 

  match_rationale from discovery), a "potential gaps" list.

- Admissions: apply link, deadlines by round, required materials 

  checklist, test requirement status, application fee.

- Class Profile: avg GRE/GMAT/GPA/IELTS/TOEFL, class size, % international, 

  STEM designation.

- Tuition & Funding: tuition amount + currency, GA/TA availability, 

  estimated accommodation cost range.

If a tab's data hasn't been researched yet, trigger the enrichment flow 

described below and show a loading skeleton, not blank content. If a 

specific field comes back null even after research, show "Data not 

available" rather than a blank space.

5. SETTINGS (/settings)

Editable version of the onboarding form, plus a placeholder "Subscription" 

section (just UI for now — Plan name, "Upgrade" button, no real billing 

logic yet).

DATABASE SCHEMA

Set up these tables with Row Level Security so users only see their own 

data (profiles, preference_vectors, user_entries, entry_status_history, 

discover_jobs are user-scoped; universities, programs, and related 

catalog tables are public-read):

- profiles: id (FK auth.users), full_name, country_of_origin, 

  target_degree_level, target_major, target_countries (text array), 

  target_tier, funding_preference, budget_ceiling, budget_currency, 

  gpa, test_scores (jsonb), work_exp_years, target_intake

- preference_vectors: user_id, weights (jsonb)

- universities: id, name, country, city, qs_ranking, website_url

- programs: id, university_id, name, degree_level, department, is_stem, 

  last_verified_at

- program_admissions: program_id, deadline_type, deadlines (jsonb), 

  required_materials (jsonb), test_requirement_status, application_fee, 

  application_fee_currency

- program_class_profile: program_id, avg_gre, avg_gmat, avg_gpa, 

  avg_ielts, avg_toefl, class_size, intl_pct

- program_funding: program_id, tuition_amount, tuition_currency, 

  ga_ta_availability, est_accommodation_low, est_accommodation_high

- program_research_sources: program_id, url

- user_entries: id, user_id, university_id, program_id, score, status, 

  source (scored/manual/discover_more), match_rationale, is_favorite, 

  is_liked, is_disliked, is_archived, notes

- entry_status_history: entry_id, old_status, new_status, changed_at

- discover_jobs: id, user_id, status (pending/running/done/failed), 

  requested_at, completed_at

LLM-POWERED UNIVERSITY RESEARCH

Store the Anthropic API key as a Supabase Edge Function secret named 

ANTHROPIC_API_KEY — never expose it client-side. Set up two Edge 

Functions that call https://api.anthropic.com/v1/messages with model 

"claude-sonnet-4-6" and the web_search tool enabled, so results reflect 

current information rather than stale training data.

IMPORTANT: when web_search is used, the API response contains multiple 

content blocks (tool_use, tool_result, text) — extract the final text 

block by its "type" field, don't assume it's content[0]. Strip any 

markdown code fences before JSON.parse, wrap parsing in try/catch, and 

mark the job "failed" rather than crashing if parsing fails.

--- FUNCTION 1: discover-universities ---

Triggered after onboarding completes and on every "Discover More" click. 

Inserts a discover_jobs row, then:

System prompt: "You are a graduate admissions research assistant. Given 

a student's profile, identify real, currently-operating master's degree 

programs that are strong matches. Use web search to verify each 

university and program actually exists and that the basic facts are 

accurate. If you cannot verify a program with reasonable confidence, 

exclude it rather than guessing. Exclude any university_name + 

program_name pairs given in the excluded list."

User message (filled in from the profile, plus a list of university+

program pairs the user already has so repeated calls don't duplicate):

"Student profile: target major [X], target countries [X], degree level 

[X], tier preference [X], funding preference [X], budget [X currency], 

GPA [X], test scores [X], work experience [X years], target intake [X].

Already shown: [list].

Return exactly 5 new programs that best match this profile. Respond 

with ONLY a JSON array, no other text, no markdown fences, in exactly 

this shape:

[{

  "university_name": string, "university_country": string,

  "university_city": string, "qs_ranking": number or null,

  "website_url": string, "program_name": string,

  "degree_level": string, "department": string, "is_stem": boolean,

  "match_rationale": string (1-2 sentences, plain language)

}]"

Parse the response, upsert into universities/programs (dedupe on name + 

program name), create user_entries rows with status "scored" and the 

appropriate source, store match_rationale on the entry, mark the job 

"done".

--- FUNCTION 2: enrich-university ---

Triggered when a user opens a university detail page where admissions/

class_profile/funding rows don't exist yet, or are older than 90 days. 

Takes university_name, program_name, website_url.

System prompt: "You are a graduate admissions research assistant. 

Research the specific program given using web search. Only return 

values you can verify from current sources — use null for anything you 

cannot confirm. Do not estimate or guess numeric fields."

User message:

"University: [name]. Program: [name]. Website: [url].

Find current admissions deadlines, requirements, class profile, and 

funding information. Respond with ONLY this JSON shape, no other text:

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

}"

Parse and upsert into program_admissions, program_class_profile, and 

program_funding. Store the current timestamp as last_verified_at on the 

program row, and store each source URL as a row in 

program_research_sources.

DO NOT build Contacts, Discussion Forum, Resume Builder, or real billing 

yet — those come in follow-up prompts once this core flow is solid.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a0fa8f9b-4081-4d65-be98-36a2eb295660).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
