## Add Contact (manual entry) on Outreach + global Contacts

Lets users manually add a LinkedIn contact for a program. Contacts are private to the user, auto-saved as "Saved", and appear on both the Outreach tab and the global /contacts page alongside AI-discovered ones.

### 1. Database migration

Add two columns to `program_contacts`:
- `source text not null default 'ai'` — `'ai'` or `'user'`
- `added_by uuid null references auth.users(id) on delete cascade`

RLS additions on `program_contacts` (keep existing AI-catalog read policy intact):
- SELECT where `source = 'user' AND added_by = auth.uid()`
- INSERT where `source = 'user' AND added_by = auth.uid()`
- DELETE where `source = 'user' AND added_by = auth.uid()`

Existing edge function `find-program-contacts` keeps inserting AI rows — no change needed (default `source = 'ai'`).

### 2. Outreach tab (`src/components/outreach-tab.tsx`)

- Add an "Add contact" button visible in both the populated list view and the empty state.
- Dialog with two fields validated by zod:
  - **Name** — required, trimmed, 1–100 chars
  - **LinkedIn URL** — required, must match `^https?://(www\.)?linkedin\.com/.+`, max 500 chars, trimmed
- On submit:
  1. Normalize LinkedIn URL (lowercase host, strip trailing slash).
  2. Check for an existing `program_contacts` row for this `program_id` + normalized URL (either AI catalog or this user's private row). If found, reuse it.
  3. Otherwise insert a new `program_contacts` row with `source='user'`, `added_by=auth.uid()`, `program_id`, `name`, `linkedin_url`, other fields null.
  4. Insert `user_saved_contacts` row with `status='saved'` (skip if already saved).
  5. Prepend the contact to local state, mark as saved, close dialog, toast "Contact added".

### 3. Global Contacts page (`/contacts`)

No structural change required — it queries `user_saved_contacts` joined to `program_contacts`, and the new RLS lets the owner read their private rows. Verify the Kanban card handles null `headline`, `graduation_year`, `country` (already possible for AI rows).

### 4. Removal cleanup

Update the existing "Remove contact" handler on /contacts: after deleting the `user_saved_contacts` row, if the underlying `program_contacts.source === 'user'` and `added_by === current user`, also delete the `program_contacts` row so no orphan remains.

### Out of scope
- Editing a manually added contact (remove + re-add instead).
- Sharing a user-added contact to the AI catalog.
- Changes to the AI discovery function or its caching.
