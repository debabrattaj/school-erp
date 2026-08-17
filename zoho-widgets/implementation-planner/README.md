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

## Local preview

The widget expects `ZOHO.embeddedApp`; to view it outside CRM, stub the SDK
and point the CDN tags at local copies of flatpickr, then open the file in a
browser. No build step is involved.
