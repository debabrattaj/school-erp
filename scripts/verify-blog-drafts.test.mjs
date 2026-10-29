import assert from 'node:assert/strict';
import test from 'node:test';
import { checkDraftSchema, checkDraftWordCounts, loadDrafts, renderForAudit, verifyDrafts } from './verify-blog-drafts.mjs';
import { extractDocument } from './audit-blog-content.mjs';

const draft = { slug: 'sample-guide', title: 'Sample guide', description: 'A unique sample description', sections: [['Introduction', 'An introductory paragraph.'], ['Example', 'A worked example.']] };

test('missing articles block completeness even with valid available drafts', () => {
  assert.deepEqual(checkDraftSchema([draft]), [{ kind: 'incomplete-batch', expected: 120, actual: 1 }]);
});

test('schema checks detect missing introduction and duplicate headings', () => {
  const bad = { ...draft, sections: [['Example', 'Text'], ['Example', 'More text']] };
  assert.deepEqual(checkDraftSchema([bad], 1).map((issue) => issue.kind), ['missing-introduction', 'duplicate-heading']);
});

test('in-memory rendering preserves paragraph content and metadata', () => {
  const doc = extractDocument(renderForAudit({ ...draft, title: 'Fees & "receipts"' }));
  assert.equal(doc.title, 'Fees & "receipts"');
  assert.equal(doc.wordCount, 6);
  assert.equal(doc.blocks.length, 2);
});

test('current batch cannot claim release readiness from a duplicate pass', async () => {
  const report = await verifyDrafts();
  assert.equal(report.releaseStatus, 'HOLD_FOR_EDITORIAL_AND_RENDERED_PAGE_REVIEW');
  const drafts = await loadDrafts();
  assert.equal(report.duplicateAudit.candidateArticles, drafts.length);
  assert.equal(report.schemaIssues.some((issue) => issue.kind === 'incomplete-batch'), drafts.length !== 120);
  assert.equal(report.renderedDraftPagesPresent, 0);
});

test('2000-word requirement uses article-body count and applies to new drafts', () => {
  const issues = checkDraftWordCounts([
    { id: 'candidate:short', wordCount: 1999 },
    { id: 'candidate:complete', wordCount: 2000 },
    { id: 'existing:older', wordCount: 800 },
  ]);
  assert.deepEqual(issues, [{ id: 'candidate:short', kind: 'below-required-word-count', actual: 1999, required: 2000 }]);
});
