# Admitly — Build Plan

A trustworthy, fintech-style dashboard for international students to research, score, and track master's programs. Anthropic Claude with web search powers university discovery and enrichment.

## Design system

- Deep navy/indigo primary (`oklch(0.28 0.08 265)`), warm off-white background (`oklch(0.985 0.005 85)`), single warm amber accent for score badges/status highlights.
- Typography: Instrument Serif for display headings, Inter for UI/body. Clear hierarchy, generous whitespace.
- Card-based layouts with subtle borders, soft shadows, no gradients. Score badge uses a small circular meter.
- All tokens defined in `src/styles.css`; Button/Card/Badge variants extended in shadcn components.

## Stack & infrastructure

- Enable Lovable Cloud (Supabase) for auth, Postgres, Storage, Edge Functions.
- React + TanStack Start + Tailwind + shadcn (already scaffolded).
- Email/password + Google sign-in (via `supabase--configure_social_auth`), email verification required.
- `ANTHROPIC_API_KEY` stored as an edge-function secret (requested via `add_secret`).

## Routes

- `/auth` — sign in / sign up / verify-email gate (public).
- `/onboarding` — multi-step wizard with progress bar + autosave (authenticated).
- `/_authenticated/dashboard` — university grid, filters, sort, add/discover.
- `/_authenticated/university/$id` — sticky header + tabs (Overview / Admissions / Class Profile / Tuition & Funding).
- `/_authenticated/settings` — editable profile + subscription placeholder.

## Database (all RLS-enabled)

User-scoped: `profiles`, `preference_vectors`, `user_entries`, `entry_status_history`, `discover_jobs`.
Public-read: `universities`, `programs`, `program_admissions`, `program_class_profile`, `program_funding`, `program_research_sources`.
Trigger auto-creates a `profiles` row on signup; trigger writes `entry_status_history` on status change.
Status enum: `scored | planning | in_review | in_progress | applied | interview | offer | rejected | waitlisted | enrolled | archived`.

## Edge Functions (Supabase, Deno)

1. **`discover-universities`** — inserts `discover_jobs` row, builds profile + excluded list, calls Claude `claude-sonnet-4-5` (the latest Sonnet 4.x available; `claude-sonnet-4-6` does not exist — will use the correct current model name) with `web_search_20250305` tool enabled, extracts the final `text` block, strips ``` fences, `JSON.parse` in try/catch, upserts universities/programs (dedupe by `lower(name)`), inserts 5 `user_entries` rows with `status='scored'` + `match_rationale`, marks job `done`/`failed`.
2. **`enrich-university`** — takes `program_id`; if admissions/class/funding rows missing or `last_verified_at > 90d`, calls Claude with web search, parses JSON, upserts the three tables + `program_research_sources`, updates `last_verified_at`.

Both share a helper for extracting the final text block.

## Match scoring

Computed client/edge-side from profile vs program fields (country match, tier vs QS rank, STEM, funding fit, test scores present). Simple weighted 0–100. Stored on `user_entries.score`.

## Flows

- **Signup → verify email → onboarding wizard → kicks `discover-universities` → loading screen polls `discover_jobs` until `done` → `/dashboard`.**
- **Dashboard "Discover More"** → invokes function with current entries as excluded list, returns 5 more.
- **Dashboard "+ Add University"** → manual form inserts a `user_entries` row with `source='manual'`.
- **University detail page** → on mount, if data stale/missing, calls `enrich-university` and shows skeletons; null fields render "Data not available".
- **Status dropdown** on cards and detail header updates inline; trigger logs to `entry_status_history`.

## Out of scope (per request)

Contacts, forum, resume builder, real billing — Subscription section is UI-only.

## What I'll ask the user during build

- Confirm Google sign-in is desired (default yes).
- Anthropic API key: I'll explain where to get it and request via secrets form when ready.

## Technical notes

- The model name `claude-sonnet-4-6` does not exist; I'll use the current `claude-sonnet-4-5` (latest Sonnet 4.x with web search). Flagging so you can override.
- Web search tool name: `web_search_20250305`, max_uses ~5 per call to control cost/latency.
- Response parsing: iterate `content[]`, find last block where `type === 'text'`, regex-strip leading/trailing ``` fences before `JSON.parse`; on failure mark job `failed` with error message.
- Onboarding autosave: debounced upsert to `profiles` on every field change; resume by reading existing profile on mount.
- Polling: dashboard loading state polls `discover_jobs` row every 1.5s until `status in ('done','failed')`.
