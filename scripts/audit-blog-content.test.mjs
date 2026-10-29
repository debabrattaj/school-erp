import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { auditDocuments, extractDocument } from './audit-blog-content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const text = (prefix, length = 240) => Array.from({ length }, (_, i) => `${prefix}${i}`).join(' ');
const page = (slug, body, source = 'candidate', surrounding = '') => ({
  slug, source,
  html: `<html><head><title>${slug} | Schoolment Blog</title><meta name="description" content="${slug}'s overview" /><link rel="canonical" href="https://schoolment.com/blog/${slug}/" /></head><body><header>${surrounding}</header><h1>${slug}</h1><article><p>${body}</p></article><footer>${surrounding}</footer></body></html>`,
});

test('shared headers and footers are excluded from body comparison', () => {
  const shared = text('navigation', 1500);
  const report = auditDocuments([page('first', text('alpha'), 'existing', shared), page('second', text('beta'), 'candidate', shared)]);
  assert.equal(report.blockers.length, 0);
  assert.equal(report.similarBodies.length, 0);
});

test('HTML entity, punctuation and case variants still count as exact copies', () => {
  const report = auditDocuments([page('original', 'Fees &amp; receipts: READY.'), page('copy', 'fees &#38; RECEIPTS ready!')]);
  assert.ok(report.exactDuplicates.some((d) => d.field === 'normalizedBody'));
  assert.ok(report.blockers.some((d) => d.kind === 'exact-duplicate'));
});

test('different titles and descriptions do not hide nearly identical bodies', () => {
  const body = text('workflow');
  const report = auditDocuments([page('admissions', body), page('library', body.replace('workflow70', 'book70'))]);
  assert.equal(report.similarBodies.length, 1);
  assert.ok(report.similarBodies[0].jaccardPercent > 90);
});

test('a shorter article copied inside a larger article is flagged', () => {
  const short = text('copied');
  const report = auditDocuments([page('short', short), page('long', `${text('before', 1000)} ${short} ${text('after', 1000)}`)]);
  assert.equal(report.similarBodies.length, 1);
  assert.equal(report.similarBodies[0].containmentPercent, 100);
});

test('apostrophes in metadata are preserved and body words are counted', () => {
  const doc = extractDocument(page('fees', 'Record the payment.'));
  assert.equal(doc.description, "fees's overview");
  assert.equal(doc.wordCount, 3);
});

test('table copy is compared and related-guide navigation is excluded', () => {
  const input = page('table', 'Own paragraph');
  input.html = input.html.replace('</article>', '<table><tr><td>Amount paid</td><td>Amount due</td></tr></table><h3>Related guides</h3><ul><li>Unrelated navigation words</li></ul></article>');
  const doc = extractDocument(input);
  assert.ok(doc.normalizedBody.includes('amount paid amount due'));
  assert.ok(!doc.normalizedBody.includes('unrelated'));
});

test('canonical and slug collisions block candidates with otherwise different copy', () => {
  const report = auditDocuments([page('same', text('first'), 'existing'), page('same', text('second'))]);
  assert.ok(report.blockers.some((d) => d.field === 'slug'));
  assert.ok(report.blockers.some((d) => d.field === 'canonical'));
});

test('a missing article cannot silently pass extraction', () => {
  const input = page('missing', 'Some paragraph.');
  input.html = input.html.replace(/<article>[\s\S]*?<\/article>/, '');
  const report = auditDocuments([input]);
  assert.ok(report.blockers.some((d) => d.kind === 'missing-field' && d.field === 'normalizedBody'));
});

test('failed generator validation leaves deployable pages, index and sitemap untouched', () => {
  function snapshot() {
    const files = ['sitemap.xml', 'blog/index.html'];
    for (const dir of fs.readdirSync(path.join(root, 'landing-page/blog'), { withFileTypes: true })) {
      const relative = `blog/${dir.name}/index.html`;
      if (dir.isDirectory() && fs.existsSync(path.join(root, 'landing-page', relative))) files.push(relative);
    }
    return files.sort().map((file) => [file, createHash('sha256').update(fs.readFileSync(path.join(root, 'landing-page', file))).digest('hex')]);
  }
  const before = snapshot();
  const result = spawnSync(process.execPath, ['landing-page/scripts/generate-blog-library.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).candidatesBlocked, 120);
  assert.deepEqual(snapshot(), before);
});
