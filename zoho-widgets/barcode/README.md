# Barcode (Zoho Creator widget)

The Barcode screen of the Ciyor Gold app: tags stock with a code, writes a
voucher to the `Barcode` form with one `Item_Details` subform row per
piece, and lists those rows with their Code 39 symbols rendered inline.

Everything lives in `widget.html` — markup, styles and logic — because Zoho
serves the widget as one static file.

`window.BC_CONFIG` at the top of the script holds every form, report and
field link name it uses. Two of them matter outside this widget:

- `Barcode_Item_Details_Report` — the report behind the `Item_Details`
  subform, one row per barcoded piece. This is what the Sales Invoice
  widget's barcode scan reads.
- `Barcode1` — the Single Line column that keeps a code whole
  (`BC-016720`). The subform's own `Barcode` column is NUMBER, so it can
  only hold the digits; anything reading a code back should prefer
  `Barcode1`.
