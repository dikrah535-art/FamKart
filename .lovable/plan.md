## Scope

Implement 7 changes to FamKart. Many touch the same files (dashboard, ItemFormDrawer, shopping, notebook). I'll batch them.

## 1. Stat box animations + click-throughs (Dashboard)
- Rewrite the 4 stat cards in `src/routes/_app.dashboard.tsx` as a new `StatCard` component per box with bespoke hover animations:
  - **Items Needed** — CSS box w/ two flaps (`rotateY ±130deg`) on 1.8s loop while hovered; primary glow border.
  - **Urgent** — `<canvas>` overlay drawing expanding red radial rings from the top-right warning icon, new ring every 1.1s, fading as r grows.
  - **Low Stock** — small `<canvas>` bottom-right with a looping zigzag downward stock line + yellow ▼ at the tip + subtle grid.
  - **Budget Used** — CSS wallet top-right: flap opens (rotateX -150deg), then ₹ note rectangles "rain" via Framer Motion.
- All animations honor `useReducedMotion`.
- Clicks: Items Needed → `/items?tab=needed`, Urgent → `/items?tab=urgent`, Low Stock → `/items?tab=low_stock`, Budget Used → `/budget`.

## 2. New `/items` page
- New route `src/routes/_app.items.tsx` with tabs Needed | Urgent | Low Stock, opening on `?tab=…`.
- Item cards: name, category, qty/unit, status badge, green ✓ Bought button (opens the new modal — see §3).
- Back button. Realtime refresh on items changes.

## 3. ✓ Bought price modal (shared)
- New `src/components/BoughtDialog.tsx` — modal asking "Actual price paid (₹)" (number input, ghost-zero, autoselect on focus), Confirm/Cancel.
- Confirm flow: insert `purchase_history` row (item_name, category_id, quantity, unit, cost, purchased_by, family_id), set item `status='stocked'`, deduct from `families.monthly_budget`. Toast "Marked as bought! ₹X deducted from budget".
- Reuse from `/items`, `/shopping`, dashboard urgent cards. Remove the inline-buy flow from `_app.shopping.tsx`.
- Remove `estimated_cost` field from `ItemFormDrawer.tsx`.

## 4. Recurring re-queue
- New helper `src/lib/recurring.ts` exporting `requeueRecurringItems(familyId)` that queries `items` where `is_recurring=true AND status='stocked'`, compares `updated_at` against `recur_interval` (daily/weekly/monthly), and bulk-updates back to `status='needed'`.
- Call on app shell mount (`_app.tsx` or `AppShell`) and on dashboard mount.

## 5. Notebook diary dark redesign + family sharing
- `TodayDiary.tsx`: switch palette to `#1C1814` paper, `#E8D5B0` text, warm ruled lines `rgba(255,220,150,0.08)`, red margin `rgba(239,68,68,0.3)`, header in Caveat, table cells Inter. Keep existing dashboard layout (today's diary at top).
- Save: load/save scoped by `family_id` (already in schema) so all members see the same entry; explicit "Save Entry" button with "Saving…" / "Saved ✓ HH:MM" states (keep debounced autosave too).
- Bought checkbox: when ticked AND row hasn't been deducted yet, deduct `price` from `families.monthly_budget`, mark row `deducted: true` in JSON, toast.
- Apply same palette to `_app.notebook.tsx` viewer pages.

## 6. To-Do feature
- **Migration**: create `public.todo_entries` per spec + RLS (family-scoped via `current_family_id()` helper, mirrors notebook policies) + GRANTs.
- New `src/routes/_app.todo.tsx` with dark-diary styling, add/edit/assign/due-date/complete, animated strikethrough line (Framer width 0→100%), auto-clear completed at midnight (filter `created_at::date = today`).
- Sidebar: add "To-Do" link with `CheckSquare` icon between Notebook and Settings in `AppShell.tsx`; pulsing green dot when incomplete tasks exist for today (small subscription/poll).
- Realtime subscription so family sees updates live.

## 7. Zero fix on price inputs
- Add `onFocus={(e) => e.target.select()}` (use existing `selectOnFocus` helper) to all remaining price/number inputs: items page bought modal, todo, notebook diary price cells, shopping price (now in modal).

## Files
- New: `src/routes/_app.items.tsx`, `src/routes/_app.todo.tsx`, `src/components/BoughtDialog.tsx`, `src/lib/recurring.ts`
- Edit: `src/routes/_app.dashboard.tsx`, `src/routes/_app.shopping.tsx`, `src/routes/_app.notebook.tsx`, `src/components/TodayDiary.tsx`, `src/components/ItemFormDrawer.tsx`, `src/components/layout/AppShell.tsx`, `src/routes/_app.tsx`
- Migration: add `todo_entries` table + RLS + GRANTs

## Out of scope
- Editing the auto-generated `routeTree.gen.ts` (Vite plugin regenerates).
- Backfill of existing notebook rows to mark them `deducted` — new ticks only.

Confirm and I'll build it (migration runs first, then code).