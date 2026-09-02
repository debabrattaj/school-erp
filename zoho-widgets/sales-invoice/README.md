# Sales Invoice (Zoho Creator widget)

The Create Invoice screen of the Ciyor Gold app: invoice header, the four
item sections (Purchase Old Gold, Product, Service, Sales Return), the
calculation panel and the save into the `Sales_Invoice` form.

Everything lives in `index.html` — markup, styles and logic — because Zoho
serves the widget as one static file.

## Barcode scan

Each barcoded piece is one row of the Barcode form's `Item_Details`
subform, which is what the Barcode screen lists and what
`Barcode_Item_Details_Report` exposes. Typing or scanning a code into a
section's **Barcode Scan…** box and pressing **Add Item** (or Enter) adds
that piece instead of a blank row, so it is invoiced with the weights,
rates and charges it was tagged with rather than the item master's
defaults.

- **Where the row comes from.** `Barcode_Item_Details_Report` is read once
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
- **What is filled.** The item goes in first, because selecting it is what
  sets the row's `_srcRecord` — the record `collectItemRows` reads the
  `Item_Detail`, `Design` and `Purity` ids off, and without which the row
  is dropped on save. Its autofill puts the master's figures in; the
  tagged ones then overwrite them, because the piece was weighed, not the
  master. TCH and Discount are set type-first, since choosing a type zeroes
  the numbers below it.
- **Calculations Involved.** A scanned piece that carries DMD, CS or PS
  values ticks that box, so its weights do not land in columns the
  checkbox is keeping hidden — and so `Calculations_Involved` names them
  on save.
- **What it refuses.** A barcode already on the table is a double scan of
  one physical piece, not a second item, and is rejected naming the row it
  is on. An unknown code adds nothing. A code whose `Item_Detail` is not in
  `Item_Master_Report` still fills the row, but says so: the item has to be
  picked by hand or the row will not save.

An empty box leaves **Add Item** doing exactly what it always did — adding
a blank row.

Both Product Information and Purchase Old Gold have the box wired.
Purchase has no DMD/PS of its own and calls CS "Stone", so only the
columns it actually carries are filled; `BARCODE_SCAN_CONFIG.SECTIONS`
holds the per-section mapping.

## Field names

`ITEM_SOURCES`, `BARCODE_SCAN_CONFIG` and the `*_CONFIG` objects at the top
of the script hold every Creator form, report and field link name the
widget touches. Nothing else in the file hardcodes one, so a renamed field
is a one-line change there.
