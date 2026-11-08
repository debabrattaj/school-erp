# Free School Tools

Directory: `/free-tools/`, linked from the Product footer and sitemap.

## Document generators

Ten browser-only tools cover fee receipts, transfer certificates, notices and
circulars, attendance sheets, fee challans, bonafide certificates, character
certificates, study certificates, no-dues certificates and admission forms.
Every tool offers Classic formal, Modern school and Minimal ink templates.

Enter school details, optionally select a logo, complete the document fields,
then review the live preview. Print / Save PDF uses the browser print dialog;
disable its headers and footers for clean output. Editable HTML downloads embed
their styles and logo and can be opened offline. Attendance uses landscape A4;
other documents use portrait A4. Blank fields remain writing spaces.

Drafts are saved only when requested, in this browser's local storage, separately
for each tool. Clear drafts on shared computers. Document details and logos are
not submitted to the backend. Fee amounts use exact minor-unit totals; no-dues
clearance defaults to pending. Schools must verify and authorise issued documents.

```powershell
node scripts/build-document-tools.mjs
node --test scripts/document-tools.test.mjs scripts/free-tools.test.mjs
```

The document builder refreshes all ten pages, the directory, footer links and
sitemap entries. These are static landing-page assets; no migration is needed.

## Free School Timetable Generator

Public route: `/free-school-timetable-generator/`.

The buildless page in `landing-page/` is linked from the Product footer and sitemap.
It runs entirely in the browser and needs no API key or backend service.

## Features

- Up to five sections, six working days and ten teaching periods per day.
- Shared teacher, room and class clash checks; teacher availability and fixed lessons.
- Two configurable breaks, visible as labelled rows or columns with their times.
- Double periods cannot cross either break.
- Section and teacher views; weekdays across the top or down the first column.
- Validated manual moves, local draft saving, setup JSON download and CSV export.
- Print / Save PDF follows the selected timetable layout and includes breaks.
- The sample has two sections with eight subjects each and fills all 30 weekly teaching periods per section.

Breaks do not count toward teaching periods. A bounded search returns clearly
labelled partial results if it cannot place all requested lessons. Empty slots
remain free. Teachers should review their timetable before use.

Saved drafts stay in the current browser. The Load button restores local storage,
not a downloaded JSON file. Older drafts with a single break restore with the
second break disabled.

## Build, test and deploy

```powershell
python scripts/build-free-tool-pages.py
node --test scripts/free-tools.test.mjs
```

The builder reuses the existing Schoolment header/footer. Deploy `landing-page/`
through the existing marketing-site rsync process, preserving ERP and upload
directories. No database migration, frontend Vite build or new dependency is needed.
Apache `.htaccess` declares the `.mjs` MIME type.
