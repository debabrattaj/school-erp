import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDrafts, renderForAudit, requiredDraftWords } from './verify-blog-drafts.mjs';
import { auditDocuments, readExistingBlogs } from './audit-blog-content.mjs';
import keywordGuides from '../content/seo-guides/fees-and-attendance.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const landing = path.join(root, 'landing-page');
const blogRoot = path.join(landing, 'blog');
const publishedOn = '2026-10-29';
const selectedSlugs = new Set([
  'admission-counsellor-handover-checklist',
  'admission-document-exception-register',
  'admission-enquiry-follow-up-process',
  'admission-source-tracking-without-double-counting',
  'admission-visit-slot-capacity-planning',
  'accepted-applicant-to-student-handover',
  'exam-readiness-owner-matrix',
  'exam-result-release-approval',
  'exam-timetable-change-notice',
  'marks-entry-exception-checks',
  'report-card-preview-review',
  'role-based-school-software-training',
  'school-data-migration-count-reconciliation',
  'student-import-field-mapping-workbook',
  'school-fee-defaulter-follow-up-guide',
  'student-attendance-reporting-guide',
  'school-erp-renewal-scope-review',
  'school-erp-service-handover-directory',
  'school-software-accessibility-task-review',
  'school-system-cutover-freeze-plan',
]);

const template = fs.readFileSync(path.join(blogRoot, 'guide-to-online-fee-payment-systems', 'index.html'), 'utf8');
const header = template.match(/<header class="site-header"[\s\S]*?<\/header>/)?.[0];
const footer = template.match(/<footer class="site-footer"[\s\S]*?<\/footer>/)?.[0];
const favicon = template.match(/<link rel="icon"[^>]+>/)?.[0];
if (!header || !footer || !favicon) throw new Error('Shared blog header, footer or favicon missing');

const esc = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const idFor = (index) => `section-${index + 1}`;
const minutes = (draft) => Math.max(8, Math.ceil(auditDocuments([renderForAudit(draft)]).documents[0].wordCount / 200));

function renderArticle(draft) {
  const url = `https://schoolment.com/blog/${draft.slug}/`;
  const tableOfContents = draft.sections.map(([heading], index) => `<li><a href="#${idFor(index)}">${esc(heading)}</a></li>`).join('');
  const sections = draft.sections.map(([heading, body], index) => `<section class="policy-block"><h2 id="${idFor(index)}">${esc(heading)}</h2>${body.split('\n\n').map((paragraph) => `<p>${esc(paragraph)}</p>`).join('')}</section>`).join('\n');
  const references = draft.sources?.length ? `<section class="policy-block"><h2 id="references">References</h2><ul>${draft.sources.map(([label, url]) => `<li><a href="${esc(url)}">${esc(label)}</a></li>`).join('')}</ul></section>` : '';
  const articleSchema = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Article', headline: draft.title,
    description: draft.description, datePublished: publishedOn, dateModified: publishedOn,
    author: { '@type': 'Organization', name: 'Schoolment', url: 'https://schoolment.com/about-us/' },
    publisher: { '@type': 'Organization', name: 'Schoolment', url: 'https://schoolment.com/' }, mainEntityOfPage: url,
  });
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark"><head><meta charset="UTF-8"><script>try { document.documentElement.setAttribute('data-theme', localStorage.getItem('theme') === 'light' ? 'light' : 'dark'); } catch (_) {}</script><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(draft.title)} | Schoolment Blog</title><meta name="description" content="${esc(draft.description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${url}">${favicon}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap"><link rel="stylesheet" href="/styles.css?v=content-depth-43"><script src="/analytics.js?v=2" defer></script>
<meta property="og:type" content="article"><meta property="og:site_name" content="Schoolment"><meta property="og:title" content="${esc(draft.title)}"><meta property="og:description" content="${esc(draft.description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="https://schoolment.com/og-image.png"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${articleSchema}</script></head><body>
${header}<div class="container"><nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">Home</a><span aria-hidden="true">/</span><a href="/blog/">Blog</a><span aria-hidden="true">/</span><span aria-current="page">${esc(draft.title)}</span></nav></div>
<main><section class="section module-hero" style="padding-bottom:1.5rem;"><div class="container"><span class="eyebrow">School operations guide</span><h1>${esc(draft.title)}</h1><p class="lede">${esc(draft.description)}</p><p class="post-date">Published <time datetime="${publishedOn}">29 October 2026</time> <span class="article-meta-separator" aria-hidden="true">&middot;</span> ${minutes(draft)} min read</p></div></section>
<section class="section article-section" aria-label="Article" style="padding-top:1rem;"><div class="container article-layout"><aside class="article-sidebar"><details class="article-toc" open><summary>On this page</summary><nav aria-label="Article contents"><ol>${tableOfContents}${references ? '<li><a href="#references">References</a></li>' : ''}</ol></nav></details></aside><article class="policy-content blog-policy-content">${sections}${references}<section class="policy-block"><h2 id="next-steps">Discuss your school workflow</h2><p>Use this guide to document the current process, test a representative exception and agree who owns the next action. <a href="/#contact">Book a Schoolment demonstration</a> to review the relevant workflow with your team.</p></section></article></div></section></main>${footer}<script src="/script.js"></script></body></html>`;
}

function updateSitemap(drafts) {
  const sitemapPath = path.join(landing, 'sitemap.xml');
  let sitemap = fs.readFileSync(sitemapPath, 'utf8');
  for (const draft of drafts) {
    const escaped = draft.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    sitemap = sitemap.replace(new RegExp(`\\s*<url>\\s*<loc>https://schoolment\\.com/blog/${escaped}/</loc>[\\s\\S]*?</url>`, 'g'), '');
  }
  const entries = drafts.map((draft) => `  <url>\n    <loc>https://schoolment.com/blog/${draft.slug}/</loc>\n    <lastmod>${publishedOn}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`).join('\n');
  fs.writeFileSync(sitemapPath, sitemap.replace('</urlset>', `${entries}\n</urlset>`));
}

function updateBlogIndex(drafts) {
  const indexPath = path.join(blogRoot, 'index.html');
  const start = '<!-- LONGFORM-OPERATIONS-GUIDES:START -->';
  const end = '<!-- LONGFORM-OPERATIONS-GUIDES:END -->';
  const cards = drafts.map((draft) => `<a class="blog-card" href="/blog/${draft.slug}/"><span class="eyebrow">School operations</span><h3>${esc(draft.title)}</h3><p>${esc(draft.description)}</p><span class="featured-article-link">Read guide <span aria-hidden="true">→</span></span></a>`).join('\n');
  const block = `${start}<section class="section" id="school-operations-guides"><div class="container"><div class="section-head blog-section-head"><span class="eyebrow">School operations</span><h2>Detailed workflow guides for school teams</h2><p>Practical, role-based guides for admissions, academic records, data migration and staff adoption.</p></div><div class="blog-grid">${cards}</div></div></section>${end}`;
  let index = fs.readFileSync(indexPath, 'utf8');
  const previous = new RegExp(`${start}[\\s\\S]*?${end}`);
  if (previous.test(index)) {
    index = index.replace(previous, block);
  } else if (index.includes('</main>')) {
    index = index.replace('</main>', `${block}\n</main>`);
  } else {
    index = index.replace('<footer class="site-footer"', `${block}\n<footer class="site-footer"`);
  }
  fs.writeFileSync(indexPath, index);
}

async function selectedDrafts() {
  const drafts = [...await loadDrafts(), ...keywordGuides].filter((draft) => selectedSlugs.has(draft.slug));
  if (drafts.length !== selectedSlugs.size) throw new Error(`Expected ${selectedSlugs.size} selected drafts, found ${drafts.length}`);
  const underLength = drafts.filter((draft) => auditDocuments([renderForAudit(draft)]).documents[0].wordCount < requiredDraftWords);
  if (underLength.length) throw new Error(`Refusing to publish under-length drafts: ${underLength.map((draft) => draft.slug).join(', ')}`);
  // On repeat runs, the selected pages are already present as generated HTML.
  // Exclude only those self-generated copies so the audit still catches clashes
  // against every other published article.
  const existing = readExistingBlogs(blogRoot).filter((page) => !selectedSlugs.has(page.slug));
  const audit = auditDocuments([...existing, ...drafts.map(renderForAudit)]);
  if (audit.blockers.length) throw new Error(`Refusing to publish duplicate candidates: ${JSON.stringify(audit.blockers)}`);
  return drafts;
}

const args = process.argv.slice(2);
if (args.some((arg) => !['--check', '--write'].includes(arg)) || args.length !== 1) throw new Error('Usage: node scripts/publish-longform-operations-guides.mjs --check|--write');
const drafts = await selectedDrafts();
console.log(JSON.stringify({ selected: drafts.map((draft) => ({ slug: draft.slug, words: auditDocuments([renderForAudit(draft)]).documents[0].wordCount })), status: 'validated for local publication' }, null, 2));
if (args[0] === '--write') {
  for (const draft of drafts) {
    const destination = path.join(blogRoot, draft.slug);
    fs.mkdirSync(destination, { recursive: true });
    fs.writeFileSync(path.join(destination, 'index.html'), renderArticle(draft));
  }
  updateSitemap(drafts);
  updateBlogIndex(drafts);
  console.log(`Wrote ${drafts.length} long-form pages, updated sitemap and blog index.`);
}
