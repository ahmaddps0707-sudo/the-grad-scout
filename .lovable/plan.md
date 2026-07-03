## Fix "record new has no field updated_at" on Contacts

### Root cause
The generic `public.tg_set_updated_at()` trigger sets `NEW.updated_at`, but `user_saved_contacts` uses `last_updated_at` (no `updated_at` column). Any UPDATE (status drag, notes edit) fires the trigger and fails.

### Fix (single migration)
Drop the offending trigger on `user_saved_contacts`. The app already sets `last_updated_at` explicitly on updates, so no replacement trigger is needed.

```sql
DROP TRIGGER IF EXISTS set_updated_at ON public.user_saved_contacts;
-- (drop any other tg_set_updated_at trigger name variants on this table)
```

I'll first query `pg_trigger` to confirm the exact trigger name(s) attached to `user_saved_contacts`, then drop them in the migration.

### Out of scope
- No schema/column rename.
- No changes to other tables using this trigger correctly.
