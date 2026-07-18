## Problem

Dashboard filters (quick, status, sort) already live in URL search params, so the browser Back button restores them correctly. The bug is the in-page "Back" link on the university detail page:

`src/routes/_authenticated/university.$id.tsx:159`
```tsx
<Link to="/dashboard" className="...">← Back</Link>
```

TanStack Router's `<Link to="/dashboard">` navigates to `/dashboard` with an empty search object, wiping `?quick=…&status=…&sort=…`. It's also a forward push, not a history pop, so filters are lost even if the user had them set moments before.

Same issue applies to the `EntryCard` `onOpen` → `navigate({ to: "/university/$id", … })`: it works, but the return trip via the in-page Back link is what breaks state.

## Fix

Change only the Back control on the university detail page to pop browser history so the previously visited dashboard URL (with its search params) is restored:

- Replace the `<Link to="/dashboard">` with a `<button>` (styled identically) that calls `router.history.back()` from `useRouter()`.
- Fallback: if `window.history.length <= 1` (user landed directly on the detail URL), navigate to `/dashboard` with no params — same as today.

That's the entire change. No dashboard, routing, or state changes needed — the search-param wiring from the previous turn is correct.

## Files touched

- `src/routes/_authenticated/university.$id.tsx` — swap the Back `<Link>` for a history-back button with a direct-load fallback.
