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
  file content in place" call, so each autosave uploads the current
  content first, then deletes the previously saved copy of the same plan.
  `ZOHO.CRM.API` has no documented delete-attachment method, so cleanup
  (`deleteAttachmentSafely` in `widget.html`) tries three things in order
  and stops at the first that works:
  1. `ZOHO.CRM.API.deleteFile` — not documented, but free to try.
  2. `ZOHO.CRM.CONNECTION.invoke(CRM_CONNECTION_NAME, …)` calling the
     documented REST "Delete an Attachment" endpoint
     (`DELETE /crm/v8/Pricing/{record}/Attachments/{id}`) through a named
     Zoho CRM Connection, so Zoho authenticates the call server-side
     instead of the widget needing a raw token. Requires
     `CRM_CONNECTION_NAME` and `CRM_API_DOMAIN` (constants near the top
     of the script) to point at a real Connection and your data centre —
     see **Required Zoho CRM setup** below. A direct
     `ZOHO.CRM.HTTP.delete` call was tried first but confirmed in testing
     to resolve with `{code:"AUTHENTICATION_FAILURE", status:"error"}`
     rather than throw, since the widget isn't handed raw CRM auth for
     that call; every response here is checked for an explicit success
     status (not just "didn't throw") so a failure correctly falls
     through to step 3 instead of being masked, and the raw response is
     logged via `console.info` for visibility either way.
  3. The `deletePlannerAttachment` Deluge function (see **Required Zoho
     CRM setup** below) — works with zero extra CRM configuration beyond
     what already exists, since it's the same mechanism the existing
     `getPlannerAttachments` listing already relies on.

  A cleanup failure at every step only leaves one extra attachment behind
  — it never blocks or loses the save itself.
- **"Save now"** forces an immediate save instead of waiting for the idle
  timer — useful right before generating the summary. The autosave also
  flushes automatically before switching to a different saved version in
  the dropdown and before the widget closes, so no edits are lost.
- Opening a plan from the version dropdown makes it the active document:
  further edits autosave back into that same attachment, and the name
  field shows its name so you can rename it too.

## Required Zoho CRM setup: deleting the superseded attachment

Autosave overwrites the plan in place by uploading the new copy and then
deleting the old one. Neither `ZOHO.CRM.API` nor a bare `ZOHO.CRM.HTTP`
call can do that delete — the widget is never handed a raw CRM OAuth
token, so a direct `ZOHO.CRM.HTTP.delete` call fails with
`AUTHENTICATION_FAILURE` (confirmed in testing). One of the two options
below is required for cleanup to actually happen; without either, it
silently no-ops (logged as a console warning) and the record accumulates
one attachment per autosave.

### Option A — a Zoho CRM Connection (no server-side function needed)

`ZOHO.CRM.CONNECTION.invoke(name, request)` calls a REST endpoint through
a named Connection, letting Zoho authenticate it server-side without the
widget ever seeing a token. This is what `deleteAttachmentSafely` tries
first (after the free `ZOHO.CRM.API.deleteFile` check).

1. Under Setup → Developer Space → Connections, create (or reuse) a
   connection to Zoho CRM's own API with attachments delete scope
   (`ZohoCRM.modules.ALL` covers it).
2. In `widget.html`, set `CRM_CONNECTION_NAME` (near the top of the
   `<script>` block) to that connection's name, and confirm
   `CRM_API_DOMAIN` matches your data centre.

No Deluge function is needed if this works — check the console for
`Autosave: ZOHO.CRM.CONNECTION.invoke response` to confirm the nested
response actually shows success (see the comment above
`isConnectionCallSuccessful` in `widget.html` for the shapes it checks).

### Option B — a `deletePlannerAttachment` Deluge function (fallback)

If a Connection isn't available, this is the same mechanism the existing
`getPlannerAttachments` listing already relies on, so it's the option
guaranteed to work. Add a function named **`deletePlannerAttachment`**
next to `getPlannerAttachments` (Zoho CRM → Setup → Developer Space →
Functions), taking `recordId` and `fileId` arguments:

```deluge
string deletePlannerAttachment(recordId, fileId)
{
	response = invokeurl
	[
		url :"https://www.zohoapis.com/crm/v2/Pricing/" + recordId + "/Attachments/" + fileId
		type :DELETE
		connection:"crm_conn"
	];

	return response.toString();
}
```

Adjust two things to match your org before saving it:

- **API domain** — `zohoapis.com` only applies to the US data centre;
  swap it for whichever one `getPlannerAttachments` already calls
  (`.eu`, `.in`, `.com.au`, `.jp`, `.ca`, …).
- **`connection`** — reuse the same OAuth connection name
  `getPlannerAttachments` uses (it needs the CRM attachments-delete scope);
  create one under Setup → Developer Space → Connections if none exists
  yet — this can be the same connection as Option A.

The widget calls this function by name (`ZOHO.CRM.FUNCTIONS.execute`), so
no changes to `widget.html` are needed once it's added — autosave falls
through to it automatically whenever options 1–2 don't confirm success.

## Local preview

The widget expects `ZOHO.embeddedApp`; to view it outside CRM, stub the SDK
and point the CDN tags at local copies of flatpickr, then open the file in a
browser. No build step is involved.
