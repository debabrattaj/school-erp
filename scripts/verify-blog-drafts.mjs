import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { auditDocuments, readExistingBlogs, summarizeAudit } from './audit-blog-content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const requiredDraftWords = 2000;
const escape = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// Read-only: this verifier never generates public pages or changes the sitemap.
export async function loadDrafts(directory = path.join(root, 'content/blog-library')) {
  const drafts = [];
  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.mjs')).sort()) {
    const rows = (await import(pathToFileURL(path.join(directory, file)).href)).default;
    if (!Array.isArray(rows)) throw new Error(`${file}: expected an array of drafts`);
    drafts.push(...rows.map((row) => ({ ...row, sourceFile: file })));
  }
  return drafts;
}

export function checkDraftSchema(drafts, expectedCount = 120) {
  const issues = [];
  if (drafts.length !== expectedCount) issues.push({ kind: 'incomplete-batch', expected: expectedCount, actual: drafts.length });
  for (const draft of drafts) {
    const add = (kind, detail) => issues.push({ kind, slug: draft.slug, detail });
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug ?? '')) add('invalid-slug', draft.slug);
    for (const key of ['title', 'description']) if (typeof draft[key] !== 'string' || !draft[key].trim()) add('missing-field', key);
    if (!Array.isArray(draft.sections) || !draft.sections.length) {
      add('missing-sections', 'No article sections');
      continue;
    }
    if (draft.sections[0]?.[0] !== 'Introduction') add('missing-introduction', 'First section must be Introduction');
    const headings = new Set();
    for (const section of draft.sections) {
      if (!Array.isArray(section) || section.length !== 2 || section.some((part) => typeof part !== 'string' || !part.trim())) {
        add('invalid-section', section);
        continue;
      }
      const [heading, body] = section;
      if (headings.has(heading.toLowerCase())) add('duplicate-heading', heading);
      headings.add(heading.toLowerCase());
      if (/\b(?:TODO|TBD|lorem ipsum)\b|\uFFFD/i.test(body)) add('placeholder-or-encoding', heading);
    }
    for (const source of draft.sources ?? []) {
      try {
        if (!Array.isArray(source) || source.length !== 2 || !source[0] || new URL(source[1]).protocol !== 'https:') throw new Error();
      } catch { add('invalid-source', source); }
    }
  }
  return issues;
}

export function renderForAudit(draft) {
  return {
    slug: draft.slug, source: 'candidate',
    html: `<head><title>${escape(draft.title)} | Schoolment Blog</title><meta name="description" content="${escape(draft.description)}"><link rel="canonical" href="https://schoolment.com/blog/${escape(draft.slug)}/"></head><h1>${escape(draft.title)}</h1><article>${draft.sections.map(([heading, body]) => `<h2>${escape(heading)}</h2>${body.split('\n\n').map((paragraph) => `<p>${escape(paragraph)}</p>`).join('')}`).join('')}</article>`,
  };
}

export function checkDraftWordCounts(documents) {
  return documents.filter((doc) => doc.id.startsWith('candidate:') && doc.wordCount < requiredDraftWords)
    .map((doc) => ({ id: doc.id, kind: 'below-required-word-count', actual: doc.wordCount, required: requiredDraftWords }));
}

export function checkLocalLinks(pages, landingRoot) {
  const missing = [];
  for (const page of pages) {
    for (const [, , raw] of page.html.matchAll(/\b(?:href|src)\s*=\s*(["'])(.*?)\1/gi)) {
      if (!raw || /^(?:#|data:|mailto:|tel:|javascript:)/i.test(raw)) continue;
      let url;
      try { url = new URL(raw.replaceAll('&amp;', '&'), `https://schoolment.com/blog/${page.slug}/`); }
      catch { missing.push({ slug: page.slug, target: raw, reason: 'invalid-url' }); continue; }
      if (url.origin !== 'https://schoolment.com') continue;
      const target = path.resolve(landingRoot, `.${decodeURIComponent(url.pathname)}`);
      if (!target.startsWith(`${landingRoot}${path.sep}`) && target !== landingRoot) {
        missing.push({ slug: page.slug, target: raw, reason: 'outside-site' });
        continue;
      }
      // Server routes/redirects need a separate live check; absent files are
      // reported as unresolved, not asserted to be HTTP 404s.
      if (!fs.existsSync(target) || (fs.statSync(target).isDirectory() && !fs.existsSync(path.join(target, 'index.html')))) {
        missing.push({ slug: page.slug, target: raw, reason: 'no-local-file-review-server-route' });
      }
    }
  }
  return [...new Map(missing.map((item) => [`${item.slug}:${item.target}`, item])).values()];
}

export async function verifyDrafts() {
  const drafts = await loadDrafts();
  const schemaIssues = checkDraftSchema(drafts);
  const existing = readExistingBlogs(path.join(root, 'landing-page/blog'));
  const report = auditDocuments([...existing, ...drafts.map(renderForAudit)]);
  const draftCounts = report.documents.filter((doc) => doc.id.startsWith('candidate:')).map((doc) => doc.wordCount);
  const wordCountIssues = checkDraftWordCounts(report.documents);
  const repeatedDraftParagraphs = report.sharedParagraphs.filter((paragraph) => paragraph.pages.some((id) => id.startsWith('candidate:')));
  const sitemap = fs.readFileSync(path.join(root, 'landing-page/sitemap.xml'), 'utf8');
  const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  const duplicateSitemapUrls = [...new Set(locations.filter((url, index) => locations.indexOf(url) !== index))];
  const localLinkIssues = checkLocalLinks(existing, path.join(root, 'landing-page'));
  return {
    releaseStatus: 'HOLD_FOR_EDITORIAL_AND_RENDERED_PAGE_REVIEW',
    duplicateAudit: summarizeAudit(report),
    schemaIssues,
    draftWordCount: { requiredMinimum: requiredDraftWords, minimum: Math.min(...draftCounts), maximum: Math.max(...draftCounts), meetingMinimum: draftCounts.length - wordCountIssues.length, belowMinimum: wordCountIssues.length },
    wordCountIssues,
    repeatedDraftParagraphs,
    existingRepeatedParagraphs: report.sharedParagraphs.filter((paragraph) => paragraph.pages.every((id) => id.startsWith('existing:'))),
    topicReview: report.topicReview,
    sitemap: { urls: locations.length, duplicateUrls: duplicateSitemapUrls },
    localLinkIssues,
    sourcesToVerify: drafts.flatMap((draft) => (draft.sources ?? []).map(([label, url]) => ({ slug: draft.slug, label, url }))),
    renderedDraftPagesPresent: drafts.filter((draft) => fs.existsSync(path.join(root, 'landing-page/blog', draft.slug, 'index.html'))).length,
    documents: report.documents,
    limitations: [
      'Internal phrase matching is not a public-web plagiarism check or semantic originality guarantee.',
      'Passing duplicate checks is not approval of factual accuracy, depth, product claims or design.',
      'Draft metadata is rendered in memory; final public HTML, mobile layouts and deployment are not validated here.',
      'Word counts are an inventory measure, not a search-engine minimum or quality guarantee.',
    ],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--json') || args.length > 1) throw new Error('Usage: node scripts/verify-blog-drafts.mjs [--json]');
  const report = await verifyDrafts();
  const { documents, existingRepeatedParagraphs, localLinkIssues, wordCountIssues, ...summary } = report;
  console.log(JSON.stringify(args.includes('--json') ? report : {
    ...summary, existingRepeatedParagraphGroups: existingRepeatedParagraphs.length,
    unresolvedLocalLinks: localLinkIssues.length,
  }, null, 2));
  // A successful duplicate check alone must never be presented as release approval.
  process.exitCode = 1;
}
