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
beneath. Picking one — click, or arrow keys and Enter — adds it, so a
piece can be taken off the list without typing its code out in full. A
code typed or scanned in full still works through **Add Item** or Enter.

- **What it fetches.** Item Detail, Design and Purity. A scan says which
  piece this is; it does not price it, so quantity, weights, rates,
  amounts, TCH and discount stay as they are for the counter to enter.
  Because of that, the item is put into the row's dropdown directly rather
  than through its change handler — that handler would autofill the item
  master's own weights and rates.
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

An empty box leaves **Add Item** doing exactly what it always did — adding
a blank row.

Both Product Information and Purchase Old Gold have the box wired.
Purchase has no Design column of its own, so it fetches the item and its
purity; `BARCODE_SCAN_CONFIG.SECTIONS` holds the per-section mapping.

## Field names

`ITEM_SOURCES`, `BARCODE_SCAN_CONFIG` and the `*_CONFIG` objects at the top
of the script hold every Creator form, report and field link name the
widget touches. Nothing else in the file hardcodes one, so a renamed field
is a one-line change there.
