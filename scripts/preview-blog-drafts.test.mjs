import assert from 'node:assert/strict';
import test from 'node:test';
import { renderPreview, checkPreview, reviewPreviews } from './preview-blog-drafts.mjs';

const draft = { slug: 'test-guide', title: 'A guide <example>', description: 'Review "quotes" & meaning', sections: [['Introduction', 'A paragraph.'], ['Review', 'Another paragraph.']] };

test('preview escapes authored content and preserves shared branding', () => {
  const html = renderPreview(draft);
  assert.ok(html.includes('A guide &lt;example&gt;'));
  assert.ok(html.includes('Review &quot;quotes&quot; &amp; meaning'));
  assert.deepEqual(checkPreview(html), []);
});

test('preview check detects broken contents links and duplicate IDs', () => {
  const html = renderPreview(draft).replace('id="section-2"', 'id="section-1"');
  assert.ok(checkPreview(html).some((issue) => issue.includes('Duplicate IDs')));
  assert.ok(checkPreview(html).some((issue) => issue.includes('Missing fragment')));
});

test('every available draft renders with valid local heading links and noindex', async () => {
  const review = await reviewPreviews();
  assert.equal(review.pages.length, review.drafts.length);
  assert.deepEqual(review.issues, []);
});
