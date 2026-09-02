# Sales Invoice (Zoho Creator widget)

The Create Invoice screen of the Ciyor Gold app: invoice header, the four
item sections (Purchase Old Gold, Product, Service, Sales Return), the
calculation panel and the save into the `Sales_Invoice` form.

Everything lives in `index.html` — markup, styles and logic — because Zoho
serves the widget as one static file.

## Barcode scan

Each barcoded piece is one row of the Barcode form's `Item_Details`
subform, which is what the Barcode screen lists and what
`Barcode_Item_Details_Report` exposes. Typing into a section's **Barcode
Scan…** box searches those pieces as you type and drops the matches into a
list under the box, each read as **`item name - design`** with its code
beneath. Picking one — click, or arrow keys and Enter — puts it straight on
the table, so a piece can be added without typing its code out in full and
without a second click. A scanner's trailing Enter takes the first match,
which is the code it just sent.

**Add Item** is untouched by any of this: it adds a blank row, whatever is
in the box.

- **Which row it fills.** The first row with no item on it — the blank the
  table opens with, or one **Add Item** left — because that is the blank
  the operator is looking at. A row is only added when every row already
  holds a piece.
- **What it fetches.** Every column the subform carries: Item Detail,
  Design, Purity, quantity, the weights and rates, DMD/CS/PS, TCH,
  discount and the line total — the piece was weighed and priced when it
  was tagged. The row then recalculates the way any edited row does, so
  net weight, the amounts and the line total agree with the figures that
  came across. TCH and discount are set type-first, since choosing a type
  zeroes the numbers under it, and a type the dropdown does not list is
  left blank rather than blanking the group. A piece carrying DMD, CS or
  PS values ticks that Calculations Involved box, so its weights are not
  filled into columns the checkbox is hiding.
  The item goes into the row's dropdown directly rather than through its
  change handler: that handler would autofill the item master's own
  figures over the tagged ones.
- **What it searches.** The code, and what the piece reads as, so a
  half-typed code and a remembered item name both find it. An exact code
  sorts first, then codes starting with what was typed, then the rest;
  eight matches at most, and the first is highlighted so a scanner's
  trailing Enter takes the piece it just read.
- **Where the rows come from.** `Barcode_Item_Details_Report` is read once
  at startup, the same way the customer, item and tax masters are, and
  indexed by code. The report cannot be filtered to a single piece, so a
  code that misses the index triggers one re-read (at most every 10s)
  before it is called unknown — a piece tagged after the screen loaded is
  still found.
- **Which code matches.** `Barcode1` is the Single Line column that keeps
  the code whole (`BC-016720`); the subform's own `Barcode` column is
  NUMBER and only ever holds the digits. Both are indexed, and so is the
  digits-only form of each code, so a scan that drops the `BC-` prefix
  still lands on the row. A real code always wins over a digits-only alias.
- **What is saved.** Selecting the item sets the row's `_srcRecord` — the
  record `collectItemRows` reads the `Item_Detail`, `Design` and `Purity`
  ids off, and without which the row is dropped on save. For a scanned
  row, the piece's own design and purity ids override the master's
  defaults, so what is saved matches what the row shows.
- **What it refuses.** A barcode already on the table is a double scan of
  one physical piece, not a second item, and is rejected naming the row it
  is on. An unknown code adds nothing. A code whose `Item_Detail` is not in
  `Item_Master_Report` still fills the row, but says so: the item has to be
  picked by hand or the row will not save.

Both Product Information and Purchase Old Gold have the box wired.
Purchase has no Design column of its own, so it fetches the item and its
purity; `BARCODE_SCAN_CONFIG.SECTIONS` holds the per-section mapping.

- **Hover.** Moving the mouse over a row moves the highlight and nothing
  else. Re-rendering the list there would destroy the row under the cursor
  between its mousedown and its mouseup, and the click would never arrive —
  the list would look right and do nothing.

## TCH service types

The row's TCH dropdown carries the same three options as the Barcode
widget's Service Type, value for value — `percentage` / "Percentage (%)",
`piece` / "Per Piece", `rate` / "Per Rate/gm" — so a scanned piece's
`Service_Item` selects here rather than falling through as an unknown
type. A row that stored the label instead of the code selects the same
option; both are matched.

The rate box means different things to the two rate types, so the amount
comes off a different basis: **Per Rate/gm** multiplies by net weight,
**Per Piece** by quantity. Percentage stays as it was — a percentage of
the board amount.

## Field names

`ITEM_SOURCES`, `BARCODE_SCAN_CONFIG` and the `*_CONFIG` objects at the top
of the script hold every Creator form, report and field link name the
widget touches. Nothing else in the file hardcodes one, so a renamed field
is a one-line change there.
