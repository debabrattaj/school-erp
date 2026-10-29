# Blog duplication audit — 9 October 2026

**Result: FAIL for the proposed 120-page batch. None of these candidate pages should be published in their current form.**

The audit compared 46 existing local article files with 120 candidate articles rendered in memory from `landing-page/scripts/generate-blog-library.mjs`. No candidate HTML files, sitemap entries or blog index cards were written. There are 47 blog directories, but the former top-10 comparison has no article file; its URL redirects to the top-20 comparison in `.htaccess`.

## Findings

| Check | Result |
| --- | --- |
| Existing articles inspected | 46 |
| Proposed articles inspected | 120 |
| Exact duplicate slugs, canonical URLs, H1s, page titles or meta descriptions | 0 pairs |
| Exact duplicate full article bodies after normalisation | 0 pairs |
| Near-duplicate candidate bodies | All 120 candidates; 7,140 pairs |
| Candidate pair similarity | 92.07–97.46% five-word phrase Jaccard similarity |
| Candidate vs existing near-duplicate bodies | 0 pairs above the configured thresholds |
| Existing vs existing near-duplicate bodies | 0 pairs above the configured thresholds |
| Missing article/title/description/canonical fields | 0 |
| Duplicate entries in the current sitemap | 0 out of 77 URLs |

Unique titles and descriptions do not make this batch original. The generator puts the same explanation, workflow, role guidance and checklist under each topic. Changes to the opening sentence, category and title prevent exact whole-body matches but leave almost all the phrasing shared.

Eight substantial paragraphs are identical across all 120 candidates. For example, every draft contains the same 48-word paragraph beginning “Start by mapping the workflow exactly as it happens today” and the same 50-word paragraph beginning “Roles should follow responsibility, not job title alone”. When shared paragraphs of at least 30 words are counted, 62.17–63.72% of each candidate's analysed words occur in identical paragraphs elsewhere. This conservative measure excludes repeated shorter sentences and lists; the five-word phrase score captures more of that repetition.

## Existing articles also need editorial attention

There are no exact full-body duplicates or near-duplicate pairs above the configured thresholds among the 46 existing source articles. This is not a claim that all their text or topics are unique:

- A 30-word paragraph beginning “Use these checks when reviewing the process” appears in 30 articles.
- Eleven city articles share several product, vendor-verification and demonstration paragraphs.
- `how-schools-reduce-fee-collection-time-with-erp` and `reduce-fee-collection-delays` overlap in their headline subject. The title-token check flagged them for review, although their body text does not cross the near-duplicate threshold.

## Topic overlap review

The following are editorial observations from reviewing existing titles and section headings alongside the proposed titles. They are potential intent overlap, not findings of verbatim copying. The new article must have a specific, materially different purpose, or the existing page should be expanded instead.

| Proposed page | Existing page to review | Recommended treatment |
| --- | --- | --- |
| `questions-before-choosing-school-erp` | `questions-to-ask-before-buying-school-management-system` | Merge the general question list into the existing buyer guide. |
| `school-technology-vendor-evaluation` | `how-to-compare-school-erp-vendors` | Expand the existing evaluation guide unless a distinct procurement stage is defined. |
| `biometric-attendance-for-schools` | `how-biometric-attendance-systems-work` | Avoid repeating the hardware and integration overview; define a narrower device acceptance exercise if retained. |
| `school-year-setup-checklist` | `back-to-school-checklist-erp-setup` | Extend the existing readiness checklist rather than publish another broad checklist. |
| `reduce-admission-season-workload` | `manage-admissions-season-efficiently` | Merge the broad admissions advice; retain new pages only for specific sub-processes. |
| `school-fee-payment-options-guide` | `guide-to-online-fee-payment-systems` | Use the existing payment guide for the overview; any new page needs a narrower channel-specific scenario. |
| `school-transport-management-guide` | `challenges-managing-school-transport` | Reuse the broad overview; retain only a distinct operational drill or record template as a separate page. |

## Method and limits

- Compared local source files, not the live server and not the entire public web.
- Excluded headers, footers, navigation, table-of-contents links, related-guide lists and the standard “Using this guide” closing section.
- Analysed article paragraphs, list entries and table cells. Normalised HTML entities, case and punctuation.
- Flagged near-duplicates at 70% or greater Jaccard overlap of distinct five-word sequences, or 85% or greater coverage of the shorter article's sequences; both articles must contain at least 200 analysed words.
- Reported repeated paragraphs of at least 30 words separately, including repetition below the whole-article threshold.
- Compared title tokens as an additional prompt for editorial review. This does not reliably detect every synonymous or overlapping topic, hence the manual review above.

These thresholds are local editorial checks, not Google ranking rules. Passing them alone does not prove originality, factual accuracy or editorial quality.

## Preventing accidental generation

The generator now renders candidates in memory and runs the audit before any website file writes. Importing it has no publication side effects. Its default and `--check` modes are validation-only. Its `--write` mode also stops if candidate validation fails. A failed check exits with code 1.

Run from the repository root:

```text
node scripts/audit-blog-content.mjs
node scripts/audit-blog-content.mjs --json
node landing-page/scripts/generate-blog-library.mjs --check
node --test scripts/audit-blog-content.test.mjs
```

The test suite covers ignoring shared site furniture, entity and punctuation variants, near-duplicates under different titles, copied excerpts inside longer articles, metadata quoting, table content, URL collisions and missing bodies. It also compares file hashes before and after running the failing generator check to verify existing pages, the blog index and sitemap are unchanged.

## Required before publication

1. Consolidate overlapping proposed topics against the existing library.
2. Replace the repeated template body with article-specific explanations, examples and useful procedures.
3. Re-run the comparison against all existing articles and the entire new batch.
4. Review topic intent and factual claims manually, then validate navigation, metadata and layout before deployment.

The batch remains unfinished. No commit, push or live deployment was performed as part of this audit.
