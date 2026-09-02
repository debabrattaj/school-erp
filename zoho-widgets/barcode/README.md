# Barcode (Zoho Creator widget)

The Barcode screen of the Ciyor Gold app: tags stock with a code, writes a
voucher to the `Barcode` form with one `Item_Details` subform row per
piece, and lists those rows with their Code 39 symbols rendered inline.

Everything lives in `widget.html` — markup, styles and logic — because Zoho
serves the widget as one static file.

## What Add New Barcode stores

The entry form collects about forty values; `C.subformFields` named a
subform column for roughly a third of them, and the rest were dropped on
save without a word. Now only the columns whose spelling differs from the
entry form need naming there (`Item_Name` → `Item_Detail`, `CSS_*` →
`CS_*`, `Barcode` → `Barcode1`, and the aliases in `C.subformAliases`).
Everything else is matched to the subform **by its own name**, so a field
is stored as soon as `Item_Details` has a column for it — no config change
needed. Numbers go in as numbers (the entry form's `NUMERIC` list decides),
everything else as text, and an empty control is left out rather than sent
blank.

A name the subform does not carry is still dropped, because sending one
makes Creator reject the whole Barcode record — but it is now named in the
console rather than passed over:

> `Item_Details has no column for: Certification_Number, Size_Model. Those
> entries are not stored. Add the columns to the Item_Details subform (or
> name the existing ones in C.subformAliases) and they will be written with
> no further change.`

So the list of what is not being stored comes from the app itself. Add the
column in Creator, or point `C.subformAliases` at the column that already
holds it, and it starts being written.

`window.BC_DEBUG` is there for that: `BC_DEBUG.columns()` lists the field
names the probe found on `Item_Details`, and
`BC_DEBUG.buildSubformRow({MRP: 1000, ...})` shows what a set of entry
values would be written as.

`Supplier` and `SM` are excluded — they belong to the voucher, not the
row. The selected item's category is written to `Item_Category`, so the
table's CATEGORY column reads from the row rather than being looked up on
the item every time.

## Field names

`window.BC_CONFIG` at the top of the script holds every form, report and
field link name it uses. Two of them matter outside this widget:

- `Barcode_Item_Details_Report` — the report behind the `Item_Details`
  subform, one row per barcoded piece. This is what the Sales Invoice
  widget's barcode scan reads.
- `Barcode1` — the Single Line column that keeps a code whole
  (`BC-016720`). The subform's own `Barcode` column is NUMBER, so it can
  only hold the digits; anything reading a code back should prefer
  `Barcode1`.
