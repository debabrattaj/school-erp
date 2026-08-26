# Implementation Planner (Zoho CRM widget)

A single-file Zoho CRM embedded widget for planning an implementation: total
project effort, a colour-painted milestone timeline, a week/month resource
grid, and a roll-up summary that is pushed back into the Pricing record's
`RLS` subform.

Everything lives in `widget.html` — markup, styles and logic — because Zoho
serves the widget as one static file.

## SaaS redesign

The UI was rebuilt as a product-style app shell while keeping the existing
data model, CRM calls and table logic untouched:

- **App shell** — sticky top bar with product identity and the linked
  Opportunity / Proposal / Quote as chips, and a sticky bottom action bar.
- **Design tokens** — colours, radii, shadows, spacing and typography are
  CSS custom properties in `:root`, so the theme is changed in one place.
- **Cards** — each stage (effort, milestones, resources, summary) is a card
  with a title, a one-line explanation and its own toolbar.
- **Stat tiles** — live totals for effort, plan duration, resource count and
  planned mandays, split onsite/offshore.
- **Progress steps** — Save → Generate summary → Push to CRM, reflecting the
  same enable/disable rules the buttons already used.
- **Colour swatches** — the paint colour is picked from swatches instead of a
  dropdown. The original `#colorPicker` select is still the source of truth
  (kept off-screen), so the painting logic is unchanged.
- **Tables** — frozen first columns and sticky headers on both grids, a
  proper `Total` column width, hover rows, and restyled in-cell selects and
  number inputs.
- **Overlays** — toast, loader and the add-milestone modal restyled.

### Behaviour fixes made along the way

- `updateTypeBasedOnGrade()` was called when the date range changed but was
  never defined, which threw and aborted the rebuild (losing resource rows
  after the first). It is now defined, applying the same "`.LC` grades are
  Onsite and locked" rule the grade dropdown already used.
- The colour picker's placeholder option produced an empty class name, so
  painting a cell before choosing a colour threw. The placeholder is gone and
  a colour is always selected; clicking a cell that already has that colour
  still clears it.
- The effort table is rendered on load instead of staying empty until the
  development-phase field is touched, and computed effort values are rounded
  for display.

## Autosave

The plan saves itself as you work, the way Google Docs/Sheets do, instead of
requiring a name up front and a manual "Save" click:

- **Default name.** As soon as the linked Pricing record loads, the name
  field is pre-filled with `<Record Name> - Implementation Plan` (or
  "Untitled Implementation Plan" if the record has no name yet). You can
  edit it at any time — typing a new name is just another change that gets
  autosaved.
- **Debounced autosave.** Any edit (painting the timeline, editing effort
  rows, resource numbers, dates, view mode, dragging rows, renaming the
  plan…) restarts a ~1.5s idle timer; once it elapses the plan is saved.
  The status text next to the name field reflects this: "Unsaved changes"
  → "Saving…" → "Saved HH:MM" (or "Save failed — will retry on next
  change" if a save attempt errors).
- **One file, kept up to date.** The CRM Attachments API has no "update
  file content in place" call, so each autosave deletes the previously
  saved copy (`ZOHO.CRM.API.deleteFile`, best-effort — if the SDK build in
  use doesn't support it, the old copy is simply left behind rather than
  blocking the save) and re-uploads the current content under the current
  name. This keeps one attachment per open plan instead of a new
  timestamped file every save.
- **"Save now"** forces an immediate save instead of waiting for the idle
  timer — useful right before generating the summary. The autosave also
  flushes automatically before switching to a different saved version in
  the dropdown and before the widget closes, so no edits are lost.
- Opening a plan from the version dropdown makes it the active document:
  further edits autosave back into that same attachment, and the name
  field shows its name so you can rename it too.

## Local preview

The widget expects `ZOHO.embeddedApp`; to view it outside CRM, stub the SDK
and point the CDN tags at local copies of flatpickr, then open the file in a
browser. No build step is involved.
