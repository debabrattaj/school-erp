# Blog expansion progress

Updated 10 October 2026 after the user requested 2,000 words per article.

## Required standard

Each new article must contain at least **2,000 article-body words**, excluding its title, navigation, headings, footer and related links. This is the user's editorial requirement, not a search-engine rule. Word count alone is not approval: internal duplication checks, factual review, useful topic-specific content and final rendered-page checks remain necessary.

No publishing or Git push is authorised during this review stage.

## Completed expansions

| Article | Body words | Source |
| --- | ---: | --- |
| Admission Counsellor Handover: Keep the Next Parent Callback Clear | 2,272 | `content/blog-library/expanded/admission-handover.mjs` |
| Admission Enquiry Follow-Up: Build a Queue Around the Next Action | 2,277 | `content/blog-library/expanded/admission-follow-up.mjs` |
| Admission Document Exceptions: Track What Is Missing and Who Can Clear It | 2,251 | `content/blog-library/expanded/admission-documents.mjs` |
| School ERP Support Tickets: Build an Evidence Pack That Explains the Failure | 2,253 | `content/blog-library/expanded/support-evidence.mjs` |
| School Data Exports: Check Scope, Relationships and Meaning Before Acceptance | 2,230 | `content/blog-library/expanded/export-acceptance.mjs` |
| School Integration Failures: Reconcile the Outcome Before Repeating the Action | 2,179 | `content/blog-library/expanded/integration-reconciliation.mjs` |
| School System Cutover: Control New Entries During a Migration Freeze | 2,234 | `content/blog-library/expanded/cutover-freeze.mjs` |
| School Data Migration Counts: Account for Accepted, Excluded and Rejected Records | 2,240 | `content/blog-library/expanded/migration-counts.mjs` |

The admissions and selection collections import these articles. They contain original procedures, fictional worked scenarios, exception handling and review steps rather than padding repeated across articles. This checkpoint added five of the missing ten articles and expanded one additional existing draft.

## Remaining work

- 107 available drafts remain below 2,000 words.
- 5 of the planned 120 articles are still absent.
- Therefore **8 of the planned 120** meet the requested length at this checkpoint. The requested full expansion is not complete.
- The obsolete public-page generator still uses the rejected repetitive template; it has not been used to generate pages.
- Final HTML, navigation, source and layout checks remain pending.

## Verification

`node scripts/verify-blog-drafts.mjs` now reports the required 2,000-word minimum, completed count and incomplete count. `--json` includes each under-length article with its actual count. It remains read-only and returns a non-zero status while release review is on hold.

All 115 available drafts were compared against one another and the 46 existing articles after expansion. No exact or above-threshold near-duplicate pairs were found. No repeated paragraph of at least 30 words involves a new draft. This is an internal check, not web-wide plagiarism certification. The previously reported existing-page repetition and topic overlap are unchanged.

All 17 tests passed:

```text
node --test scripts/audit-blog-content.test.mjs scripts/verify-blog-drafts.test.mjs scripts/preview-blog-drafts.test.mjs
```

## Formatting preview and source checks

`node scripts/preview-blog-drafts.mjs --check` renders all 115 available drafts in memory. All pass the automated checks for one H1, Introduction, shared header/footer/favicon, unique element IDs, valid in-page fragment targets and noindex preview protection. This is structural verification, not visual verification.

`node scripts/preview-blog-drafts.mjs --serve` starts a read-only localhost preview on an available port. It does not write public pages or modify the sitemap. The preview reuses the existing blog branding and marks every article as unpublished, with its measured length. Preview navigation to the full public site is outside this small review server's scope.

A browser attempt to open the local preview was denied because its admin-enforced security policy could not be verified. No bypass was attempted. The temporary server was stopped. Desktop/mobile visual verification therefore remains blocked, not passed.

The integration guide's limited explanation of idempotent retries was checked against [Stripe's official documentation](https://docs.stripe.com/api/idempotent_requests). It explicitly does not infer that other providers or Schoolment use the same implementation. The remaining new guides describe proposed operational practices with fictional examples, not unsupported promises about enabled software features. Full factual and external-link review across all 120 is not complete.

The earlier verification report describes the pre-expansion snapshot. This progress record supersedes its new-draft counts and test totals; the remaining publication blockers still apply. No public pages, sitemap entries, Git commits or deployment were created in this expansion step.
