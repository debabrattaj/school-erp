import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This checks the site's own copy, not plagiarism across the public web.
// Scores are editorial screening thresholds, not search-engine ranking rules.
export const thresholds = {
  shingleWords: 5,
  nearDuplicateJaccard: 0.7,
  shorterArticleContainment: 0.85,
  minimumComparableWords: 200,
  repeatedParagraphMinimumWords: 30,
  titleTokenJaccard: 0.55,
};

const entities = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  ndash: '-', mdash: '-', lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"',
  middot: ' ', hellip: '...', bull: ' ', copy: 'copyright', rarr: ' ',
};
function decode(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name) => {
    if (name.startsWith('#')) {
      const number = name[1].toLowerCase() === 'x' ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      return number <= 0x10ffff ? String.fromCodePoint(number) : entity;
    }
    return entities[name.toLowerCase()] ?? entity;
  });
}
function plain(value) {
  return decode(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function words(value) {
  return value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
function normalize(value) { return words(value).join(' '); }
function attribute(tag, name) {
  return decode(tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'))?.[2] ?? '');
}
function metadata(html, name) {
  const tag = [...html.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => tag)
    .find((tag) => attribute(tag, 'name').toLowerCase() === name);
  return tag ? attribute(tag, 'content') : '';
}
function canonical(html) {
  const tag = [...html.matchAll(/<link\b[^>]*>/gi)].map(([tag]) => tag)
    .find((tag) => attribute(tag, 'rel').toLowerCase() === 'canonical');
  if (!tag) return '';
  try {
    const url = new URL(attribute(tag, 'href'), 'https://schoolment.com');
    return `${url.origin}${url.pathname.replace(/\/index\.html$/i, '/').replace(/\/$/, '')}/`;
  } catch { return ''; }
}
function shingles(tokens) {
  const set = new Set();
  for (let i = 0; i <= tokens.length - thresholds.shingleWords; i++) {
    set.add(tokens.slice(i, i + thresholds.shingleWords).join(' '));
  }
  return set;
}
function overlap(a, b) {
  if (a.size > b.size) [a, b] = [b, a];
  let common = 0;
  for (const token of a) if (b.has(token)) common++;
  return {
    jaccard: common / (a.size + b.size - common || 1),
    containment: common / (a.size || 1),
  };
}
const round = (value) => Math.round(value * 10000) / 100;

export function extractDocument({ slug, source, html }) {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|nav|aside|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  let article = clean.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? '';
  // Related links and the site's standard closing note are navigation/editorial
  // furniture, not evidence that two articles have the same subject matter.
  article = article.split(/<h[23]\b[^>]*>\s*(?:Related (?:guides|articles)|Using this guide)\s*<\/h[23]>/i)[0];
  const blocks = [...article.matchAll(/<(p|li|td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map(([, , text]) => plain(text)).filter(Boolean);
  const body = blocks.join(' ');
  const tokens = words(body);
  const title = plain(clean.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? '');
  return {
    id: `${source}:${slug}`, slug, source, title,
    pageTitle: plain(clean.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ''),
    description: metadata(html, 'description'), canonical: canonical(html),
    normalizedBody: tokens.join(' '), blocks, wordCount: tokens.length,
    shingleSet: shingles(tokens),
    titleTokens: new Set(words(title).filter((token) => !titleStopwords.has(token))),
  };
}
const titleStopwords = new Set('a an the for to of and in how what with your school schools schoolment erp guide software management system systems practical'.split(' '));

export function readExistingBlogs(root) {
  return fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())
    .map((entry) => ({ slug: entry.name, file: path.join(root, entry.name, 'index.html') }))
    .filter(({ file }) => fs.existsSync(file))
    .map(({ slug, file }) => ({ slug, source: 'existing', html: fs.readFileSync(file, 'utf8') }));
}

export function auditDocuments(inputs) {
  const docs = inputs.map(extractDocument);
  const blockers = [];
  const validationErrors = [];
  const exactDuplicates = [];
  const similarBodies = [];
  const topicReview = [];
  const repeatedParagraphs = new Map();
  for (const doc of docs) {
    for (const field of ['title', 'pageTitle', 'description', 'canonical', 'normalizedBody']) {
      if (!doc[field]) {
        const error = { kind: 'missing-field', id: doc.id, field };
        validationErrors.push(error);
        if (doc.source === 'candidate') blockers.push(error);
      }
    }
    for (const block of doc.blocks) {
      const tokens = words(block);
      if (tokens.length < thresholds.repeatedParagraphMinimumWords) continue;
      const key = tokens.join(' ');
      if (!repeatedParagraphs.has(key)) repeatedParagraphs.set(key, { text: block, words: tokens.length, pages: new Set() });
      repeatedParagraphs.get(key).pages.add(doc.id);
    }
  }
  const exactFields = ['slug', 'title', 'pageTitle', 'description', 'canonical', 'normalizedBody'];
  for (let i = 0; i < docs.length; i++) {
    for (let j = i + 1; j < docs.length; j++) {
      const a = docs[i], b = docs[j];
      const candidate = a.source === 'candidate' || b.source === 'candidate';
      for (const field of exactFields) {
        const left = ['slug', 'canonical', 'normalizedBody'].includes(field) ? a[field] : normalize(a[field]);
        const right = ['slug', 'canonical', 'normalizedBody'].includes(field) ? b[field] : normalize(b[field]);
        if (left && left === right) {
          const duplicate = { field, a: a.id, b: b.id };
          exactDuplicates.push(duplicate);
          if (candidate) blockers.push({ kind: 'exact-duplicate', ...duplicate });
        }
      }
      if (Math.min(a.wordCount, b.wordCount) >= thresholds.minimumComparableWords) {
        const { jaccard, containment } = overlap(a.shingleSet, b.shingleSet);
        if (jaccard >= thresholds.nearDuplicateJaccard || containment >= thresholds.shorterArticleContainment) {
          const pair = { a: a.id, b: b.id, jaccardPercent: round(jaccard), containmentPercent: round(containment) };
          similarBodies.push(pair);
          if (candidate) blockers.push({ kind: 'near-duplicate-body', ...pair });
        }
      }
      const titleScore = overlap(a.titleTokens, b.titleTokens).jaccard;
      if (a.titleTokens.size >= 3 && b.titleTokens.size >= 3 && titleScore >= thresholds.titleTokenJaccard) {
        topicReview.push({ a: a.id, b: b.id, titleA: a.title, titleB: b.title, titleTokenOverlapPercent: round(titleScore) });
      }
    }
  }
  similarBodies.sort((a, b) => b.jaccardPercent - a.jaccardPercent || a.a.localeCompare(b.a));
  topicReview.sort((a, b) => b.titleTokenOverlapPercent - a.titleTokenOverlapPercent);
  const sharedParagraphs = [...repeatedParagraphs.values()].filter((p) => p.pages.size > 1)
    .map((p) => ({ ...p, pages: [...p.pages].sort() }))
    .sort((a, b) => b.pages.length - a.pages.length || b.words - a.words);
  return {
    scope: 'Local blog source files and in-memory candidate articles; excludes navigation, footer, contents links and related-guide lists. No public-web plagiarism check.',
    thresholds,
    documents: docs.map((d) => ({ id: d.id, title: d.title, pageTitle: d.pageTitle, canonical: d.canonical, wordCount: d.wordCount })),
    blockers, validationErrors, exactDuplicates, similarBodies, topicReview, sharedParagraphs,
    // Expose editorial repetition as well as pair scores. A repeated paragraph
    // is counted once for each occurrence in this document.
    repeatedParagraphCoverage: docs.map((d) => {
      const repeatedWords = d.blocks.reduce((sum, block) => {
        const key = normalize(block), shared = repeatedParagraphs.get(key);
        return sum + (shared && shared.pages.size > 1 ? words(block).length : 0);
      }, 0);
      return { id: d.id, repeatedWords, wordCount: d.wordCount, percent: round(repeatedWords / (d.wordCount || 1)) };
    }),
  };
}

export function summarizeAudit(report) {
  const candidates = report.documents.filter((d) => d.id.startsWith('candidate:'));
  const pairType = (pairs, first, second) => pairs.filter((p) => p.a.startsWith(first) && p.b.startsWith(second)).length;
  const candidateOverlap = report.similarBodies.filter((p) => p.a.startsWith('candidate:') && p.b.startsWith('candidate:'));
  const affected = new Set(report.blockers.flatMap((p) => [p.a, p.b, p.id].filter((id) => id?.startsWith('candidate:'))));
  return {
    status: report.blockers.length ? 'FAIL' : 'PASS_AUTOMATED_CHECKS_ONLY',
    existingArticles: report.documents.length - candidates.length,
    candidateArticles: candidates.length,
    candidatesBlocked: affected.size,
    missingFieldErrors: report.validationErrors.length,
    exactDuplicatesByField: Object.fromEntries(['slug', 'title', 'pageTitle', 'description', 'canonical', 'normalizedBody'].map((field) => [field, report.exactDuplicates.filter((p) => p.field === field).length])),
    nearDuplicatePairs: {
      candidateVsCandidate: pairType(report.similarBodies, 'candidate:', 'candidate:'),
      existingVsCandidate: report.similarBodies.filter((p) => p.a.startsWith('existing:') !== p.b.startsWith('existing:')).length,
      existingVsExisting: pairType(report.similarBodies, 'existing:', 'existing:'),
    },
    candidatePairJaccardPercentRange: candidateOverlap.length ? [Math.min(...candidateOverlap.map((p) => p.jaccardPercent)), Math.max(...candidateOverlap.map((p) => p.jaccardPercent))] : null,
    titlePairsForEditorialReview: report.topicReview.length,
    scope: report.scope,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--json') || args.length > 1) throw new Error('Usage: node scripts/audit-blog-content.mjs [--json]');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  import('../landing-page/scripts/generate-blog-library.mjs').then(({ buildCandidates }) => {
    const report = auditDocuments([...readExistingBlogs(path.join(root, 'landing-page', 'blog')), ...buildCandidates()]);
    console.log(JSON.stringify(args.includes('--json') ? report : summarizeAudit(report), null, 2));
    if (report.blockers.length) process.exitCode = 1;
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}
