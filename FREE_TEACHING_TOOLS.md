# Free School Timetable Generator

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
