# Blog verification — 10 October 2026

## Decision: do not publish yet

Checked all 110 available rewritten drafts against one another and all 46 existing local blog articles. The automated internal duplicate checks pass, but this is **not** an approval of the complete planned 120-article release. Ten rewritten articles are absent, the drafts are short, and no final public HTML has been generated for them.

No commit, Git push, site generation or deployment was performed in this verification pass. Existing website changes were preserved.

## Results

| Check | Result |
| --- | --- |
| Rewritten drafts available / planned | 110 / 120 |
| Existing local articles compared | 46 |
| Exact duplicate slugs, titles, descriptions, canonical URLs or bodies | 0 |
| Near-duplicate article pairs above configured thresholds | 0 |
| Repeated paragraphs of at least 30 words involving rewritten drafts | 0 |
| Missing required draft fields, invalid section shape, missing Introduction | 0 |
| Placeholder / replacement-character scan | 0 findings |
| Draft body length | 209–270 words each |
| Rendered public pages for rewritten drafts | 0 |
| Existing sitemap URLs / duplicates | 77 / 0 |
| Existing repeated paragraph groups | 8 |
| Automated verification tests | 13 passed |

The pairwise analysis covers 12,090 pairs across 156 documents: 5,995 draft pairs, 5,060 draft/existing pairs and 1,035 existing pairs. It compares normalized text and five-word sequences. The near-duplicate thresholds are 70% Jaccard similarity or 85% shorter-document containment, with at least 200 words in each document. These are local screening rules, not search-engine standards. No whole-web plagiarism or exhaustive semantic-equivalence check has been performed.

All 110 rewritten drafts are brief operational guides, not detailed long-form articles. Their word count alone does not establish quality or failure, but they should not be advertised as comprehensive, lengthy guides. Editorial depth, product claims and usefulness still need review before the requested high-quality release can be approved.

## Important: two different draft sources exist

`content/blog-library/*.mjs` contains the 110 independently rewritten drafts checked above.

`landing-page/scripts/generate-blog-library.mjs` still contains the earlier, repetitive 120-article template batch. Re-running its check produced **7,140 near-duplicate pairs**, with **92.07–97.46%** five-word Jaccard similarity. All 120 legacy candidates remain blocked. This is not another approved batch and must not be used to publish the rewritten content. Its validation guard currently prevents writing those pages.

The older `scripts/audit-blog-content.mjs` CLI targets that legacy generator. Use the new read-only verifier below for the rewritten drafts; the distinction avoids confusing the legacy failure with the rewritten duplicate-check pass.

## Existing-topic review

The title checker flags this pair:

- `how-schools-reduce-fee-collection-time-with-erp`
- `reduce-fee-collection-delays`

Their headings and article text support distinct primary purposes: the first examines staff workload, processing stages and reconciliation; the second examines overdue-payment causes and parent follow-up. They are not body duplicates under the configured checks. They nevertheless overlap in generic discussion of reminders and payment friction. Preserve those separate purposes during further editing; this review is not a guarantee that they cannot compete for similar searches.

Existing blogs also contain eight groups of repeated substantial paragraphs. One generic checklist introduction appears on 30 pages; seven groups occur on 11 city pages. These are disclosed even though the full articles fall below the near-duplicate thresholds. Therefore, a blanket claim that all existing blog text has “no duplicacy” would be inaccurate.

## Links and references

The existing-page local link scan found 45 uses of one absent local directory: `/online-school-management-erp-bhubaneswar/`. The checked `.htaccess` explicitly redirects it to `/school-erp-system-powered-by-ai/`. These are redirect-dependent links, not 45 proven broken pages. A live retrieval attempt did not succeed through the browsing tool, so production redirect behaviour remains unverified. No other missing local targets were reported by this scan. Fragment targets, external links and final generated-page navigation require separate checks.

Three rewritten drafts cite external references:

- The human-centred AI statement is supported by the retrieved [UNESCO guidance](https://www.unesco.org/en/articles/guidance-generative-ai-education-and-research).
- The distinction between passwords and replay-resistant authentication is supported by the retrieved [NIST authenticator guidance, Replay Resistance](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/#replay-resistance).
- The [ADL LMS guidance PDF](https://adlnet.gov/assets/uploads/ChoosingAnLMS.pdf) timed out on retrieval during this pass. Its availability and the SCORM-version claim remain to be reverified before publication.

These targeted checks are not a complete factual audit of every existing product claim.

## Reproduce the checks

```text
node scripts/verify-blog-drafts.mjs
node scripts/verify-blog-drafts.mjs --json
node --test scripts/audit-blog-content.test.mjs scripts/verify-blog-drafts.test.mjs
node landing-page/scripts/generate-blog-library.mjs --check
```

Both verification CLIs are read-only in the modes shown. The rewritten-draft verifier intentionally exits 1 while release review is on hold. The legacy generator check exits 1 because of duplication. The test suite exits 0.

## Remaining release requirements

1. Complete the missing ten rewritten articles and re-run the entire-batch comparison.
2. Review and improve depth where needed; distinguish practical advice from verified Schoolment functionality.
3. Replace the obsolete generator's template body with the approved content source, without bypassing validation.
4. Generate locally, then verify final titles, canonicals, structured data, internal links, sitemap entries, branding and desktop/mobile layouts.
5. Resolve the outstanding reference/live-link checks and present the final report to the user.
6. Publish only after the user's subsequent instruction. Nothing in this audit grants publication approval.
