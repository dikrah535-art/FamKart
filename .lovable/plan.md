## Goals
Fix several frustrations at once: the zero-in-inputs problem, the notebook tab doing nothing, the urgent items being inert, and the bland greeting block. Replace the greeting block on the dashboard with a real daily diary you write directly on, and give the notebook page a proper viewer with calendar + page flip.

## 1. "Zero ghost text" everywhere
- Convert every numeric input we control (`ItemFormDrawer` quantity & estimated cost, `_app.budget.tsx` budget, and price inputs on the new shopping list / dashboard notebook) so the field is **empty** when the value is 0 and shows `0` as a `placeholder` instead. Typing always replaces nothing.
- Internally keep state as a string ("" → treat as 0 on save). Remove the `selectOnFocus` hack from these fields since empty inputs no longer need it.

## 2. Fix Notebook tab click
- Audit `/notebook` route. The route exists; if clicks "do nothing" it's almost certainly a runtime error in the page (e.g. failing fetch / RLS) that throws before render. Add a proper error boundary + loading state to `_app.notebook.tsx` and make sure the link in `AppShell` uses `<Link to="/notebook">` (it already does). Verify by reading current file and console.

## 3. Urgent items → Shopping list page
- Make each card in **Urgent items** on the dashboard a `<Link>` to a new route `/shopping` (also reachable from the Urgent stat box).
- New route `src/routes/_app.shopping.tsx`:
  - Lists every item where `status ∈ {needed, low_stock}` OR `priority = urgent` and `status ≠ stocked`.
  - Each row: name, qty/unit, **price input** (ghost-zero), green **✓ Bought** button.
  - Bought = update item `status='stocked'`, insert into `purchase_history` with the entered price, deduct from `families.monthly_budget`, and (if recurring) leave the recurrence rule so it comes back next cycle. Toast: "Marked as bought".
  - Realtime so the row disappears immediately.

## 4. Dashboard: replace greeting block with today's diary
- Remove the `<header>` greeting + date and instead render a `TodayDiary` component at the top of `/dashboard`.
- The diary is a cream-paper card (reusing notebook styling) headed by the time-based greeting + date, written in the Caveat font, that auto-rolls over each day.
- Below the header, a small editable table with columns:
  `# | Item | Qty | Unit | Status (dropdown: needed / low stock / urgent) | ✓ Bought | Price`
- Add-row button at the bottom. Auto-save (debounced 1.5 s) into `notebook_entries` for today **and** simultaneously insert/update a matching row in `items` so it appears in the rest of the app. Ticking Bought = same flow as the shopping page.
- At midnight (or on next load on a new date) the diary clears and starts a new page; the prior page stays accessible from `/notebook`.

## 5. Notebook page (`/notebook`)
- Replace the current grid-only view with two panes:
  - **Left:** a calendar (shadcn `Calendar`) that highlights dates that have entries; clicking a date jumps to that entry.
  - **Right:** the selected diary page rendered as an open book with **page-flip arrows** (← older / newer →) and swipe support. Reuse the existing 3D flip animation.
- Each diary page shows the same columns as the dashboard diary (item, qty, unit, status, bought ✓, price), plus the day's date and total spent. Read-only here.
- Keep "New Entry" button → routes to `/dashboard` (since today's entry now lives there).

## 6. Misc
- Remove `_app.notebook.entry.tsx` route once its functionality is folded into the dashboard diary + notebook viewer (or keep as a fallback redirect to `/dashboard`).
- Match existing FamKart dark UI; the diary paper stays cream like before.
- ₹ everywhere.

## Files touched
- `src/routes/_app.dashboard.tsx` (remove header, mount TodayDiary)
- `src/components/TodayDiary.tsx` (new)
- `src/routes/_app.notebook.tsx` (calendar + flip viewer rewrite)
- `src/routes/_app.shopping.tsx` (new)
- `src/routes/_app.notebook.entry.tsx` (redirect or delete)
- `src/components/ItemFormDrawer.tsx`, `src/routes/_app.budget.tsx` (ghost-zero)
- `src/lib/utils.ts` (drop `selectOnFocus` once unused)
- `src/components/layout/AppShell.tsx` (sidebar already has Notebook; add Shopping link)

## Out of scope (confirm if you want any of these)
- Recurring rules engine changes — bought items with `is_recurring=true` already re-surface via existing logic; I'll only ensure the bought flow doesn't break that.
- Editing past diary entries from the calendar viewer (read-only for now).

Confirm and I'll build it.
