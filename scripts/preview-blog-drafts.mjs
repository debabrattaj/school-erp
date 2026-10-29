import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDrafts, renderForAudit, requiredDraftWords } from './verify-blog-drafts.mjs';
import { extractDocument } from './audit-blog-content.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const landing = path.join(root, 'landing-page');
const template = fs.readFileSync(path.join(landing, 'blog/guide-to-online-fee-payment-systems/index.html'), 'utf8');
const header = template.match(/<header class="site-header"[\s\S]*?<\/header>/)?.[0];
const footer = template.match(/<footer class="site-footer"[\s\S]*?<\/footer>/)?.[0];
const favicon = template.match(/<link rel="icon"[^>]+>/)?.[0];
if (!header || !footer || !favicon) throw new Error('Shared blog header, footer or favicon missing');
const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const sectionId = (index) => `section-${index + 1}`;

export function renderPreview(draft) {
  const words = extractDocument(renderForAudit(draft)).wordCount;
  const toc = draft.sections.map(([heading], index) => `<li><a href="#${sectionId(index)}">${esc(heading)}</a></li>`).join('');
  const body = draft.sections.map(([heading, text], index) => `<section class="policy-block"><h2 id="${sectionId(index)}">${esc(heading)}</h2>${text.split('\n\n').map((paragraph) => `<p>${esc(paragraph)}</p>`).join('')}</section>`).join('\n');
  const references = draft.sources?.length ? `<section class="policy-block"><h2 id="references">References</h2><ul>${draft.sources.map(([label, url]) => `<li><a href="${esc(url)}">${esc(label)}</a></li>`).join('')}</ul></section>` : '';
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(draft.title)} | Schoolment Blog</title><meta name="description" content="${esc(draft.description)}"><meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="https://schoolment.com/blog/${esc(draft.slug)}/">${favicon}
<link rel="stylesheet" href="/styles.css"><style>
.draft-hero { padding-block: clamp(2rem, 5vw, 4rem); }
.draft-hero h1 { font-size: clamp(1.9rem, 4vw, 3.15rem); line-height: 1.15; max-width: 1050px; overflow-wrap: anywhere; }
.draft-hero .lede { max-width: 780px; }
.draft-status { padding: .65rem 1rem; border: 1px solid var(--border); border-radius: .65rem; color: var(--muted); margin: 1.5rem 0 0; }
.draft-article-section { padding-top: 1.5rem; }
.draft-back { display: inline-block; margin-top: 1rem; }
@media(max-width:600px) { .draft-hero h1 { font-size: 1.9rem; } .article-toc nav { max-height: 220px; } }
</style></head><body>${header}
<div class="container"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/review/">Draft library</a><span aria-hidden="true">/</span><span aria-current="page">${esc(draft.title)}</span></nav></div>
<main><section class="section module-hero draft-hero"><div class="container"><span class="eyebrow">School operations guide</span><h1>${esc(draft.title)}</h1><p class="lede">${esc(draft.description)}</p><p class="post-date">Draft preview &middot; ${Math.ceil(words / 200)} min read</p><p class="draft-status">Unpublished review copy · ${words.toLocaleString('en-IN')} body words · ${words >= requiredDraftWords ? 'Length requirement met; editorial review still required.' : 'Below the required 2,000 words.'}</p></div></section>
<section class="section draft-article-section"><div class="container article-layout"><aside class="article-sidebar"><details class="article-toc" open><summary>On this page</summary><nav aria-label="Article contents"><ol>${toc}${references ? '<li><a href="#references">References</a></li>' : ''}</ol></nav></details></aside>
<article class="blog-policy-content">${body}${references}<a class="draft-back" href="/review/">Back to unpublished drafts</a></article></div></section></main>${footer}<script src="/script.js"></script></body></html>`;
}

export function checkPreview(html) {
  const issues = [];
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicateIds.length) issues.push(`Duplicate IDs: ${[...new Set(duplicateIds)].join(', ')}`);
  for (const [, fragment] of html.matchAll(/href="#([^"]+)"/g)) if (!ids.includes(fragment)) issues.push(`Missing fragment: ${fragment}`);
  if ((html.match(/<h1\b/g) ?? []).length !== 1) issues.push('Expected one H1');
  if (!html.includes('name="robots" content="noindex, nofollow"')) issues.push('Draft indexing protection missing');
  if (!/<link rel="icon"/.test(html)) issues.push('Favicon missing');
  if (!/<h2 id="section-1">Introduction<\/h2>/.test(html)) issues.push('Introduction missing');
  if (!/<header class="site-header"/.test(html) || !/<footer class="site-footer"/.test(html)) issues.push('Shared branding missing');
  return issues;
}

export async function reviewPreviews() {
  const drafts = await loadDrafts();
  const pages = drafts.map((draft) => ({ slug: draft.slug, html: renderPreview(draft) }));
  return { drafts, pages, issues: pages.flatMap((page) => checkPreview(page.html).map((issue) => ({ slug: page.slug, issue }))) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some((arg) => !['--check', '--serve'].includes(arg)) || args.length > 1) throw new Error('Usage: node scripts/preview-blog-drafts.mjs [--check|--serve]');
  const review = await reviewPreviews();
  if (review.issues.length) {
    console.error(JSON.stringify(review.issues, null, 2));
    process.exitCode = 1;
  } else if (args.includes('--serve')) {
    const pages = new Map(review.pages.map((page) => [`/review/blog/${page.slug}/`, page.html]));
    const index = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Unpublished blog review</title><style>body{font:17px/1.6 system-ui;max-width:900px;margin:40px auto;padding:0 24px}li{margin:12px 0}a{color:#294eb0}</style></head><body><h1>Unpublished blog review</h1><p>Local review only. Length does not imply editorial approval.</p><ul>${review.drafts.map((draft) => `<li><a href="/review/blog/${esc(draft.slug)}/">${esc(draft.title)}</a> — ${extractDocument(renderForAudit(draft)).wordCount} words</li>`).join('')}</ul></body></html>`;
    const server = http.createServer((request, response) => {
      response.setHeader('X-Robots-Tag', 'noindex, nofollow');
      response.setHeader('Cache-Control', 'no-store');
      if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
      let pathname;
      try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); } catch { response.writeHead(400); response.end(); return; }
      const generated = pathname === '/review/' ? index : pages.get(pathname);
      if (generated) { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(request.method === 'HEAD' ? undefined : generated); return; }
      const target = path.resolve(landing, `.${pathname}`);
      if (!target.startsWith(`${landing}${path.sep}`) || !fs.existsSync(target) || !fs.statSync(target).isFile() || !['.css', '.js', '.png', '.svg', '.webp', '.jpg', '.woff2'].includes(path.extname(target))) { response.writeHead(404); response.end('Preview resource not found'); return; }
      const types = { '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
      response.setHeader('Content-Type', types[path.extname(target)]);
      response.end(request.method === 'HEAD' ? undefined : fs.readFileSync(target));
    });
    server.listen(0, '127.0.0.1', () => console.log(`Read-only preview: http://127.0.0.1:${server.address().port}/review/`));
  } else {
    console.log(JSON.stringify({ pagesChecked: review.pages.length, structuralIssues: review.issues.length, scope: 'In-memory HTML structure only; not browser layout or publication approval.' }, null, 2));
  }
}
