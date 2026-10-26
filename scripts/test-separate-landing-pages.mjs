import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../landing-page');
const slugs = ['online-school-management-erp-bhubaneswar', 'school-erp-system-powered-by-ai'];
const pages = slugs.map((slug) => fs.readFileSync(path.join(site, slug, 'index.html'), 'utf8'));
const sitemap = fs.readFileSync(path.join(site, 'sitemap.xml'), 'utf8');

test('both pages have independent metadata and one sitemap entry', () => {
  for (const [index, slug] of slugs.entries()) {
    const html = pages[index];
    const url = `https://schoolment.com/${slug}/`;
    assert.ok(html.includes(`<link rel="canonical" href="${url}"`));
    assert.ok(html.includes(`<meta property="og:url" content="${url}"`));
    assert.equal(sitemap.split(`<loc>${url}</loc>`).length - 1, 1);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.equal((html.match(/<link rel="canonical"/g) ?? []).length, 1);
    assert.ok(!/http-equiv=["']refresh/i.test(html));
    for (const [, json] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      const schema = JSON.parse(json);
      if (schema['@type'] === 'BreadcrumbList') assert.equal(schema.itemListElement.at(-1).item, url);
    }
  }
  assert.notEqual(pages[0].match(/<title>(.*?)<\/title>/)[1], pages[1].match(/<title>(.*?)<\/title>/)[1]);
  assert.ok(pages[0].includes('Plan a phased school ERP rollout'));
  assert.ok(pages[1].includes('Where does AI fit into the school ERP?'));
});

test('neither clean URL is redirected to the other in Apache configuration', () => {
  const rules = fs.readFileSync(path.join(site, '.htaccess'), 'utf8').split(/\r?\n/).filter((line) => !line.trim().startsWith('#'));
  for (const source of slugs) assert.ok(!rules.some((line) => /^(RewriteRule|Redirect)/i.test(line) && line.includes(source)), `Unexpected redirect involving ${source}`);
});

test('pages link to each other and local links and fragments resolve', () => {
  for (const [index, html] of pages.entries()) {
    assert.ok(html.includes(`href="/${slugs[1 - index]}/"`));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, 'Duplicate element IDs');
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (!href.startsWith('/') && !href.startsWith('#')) continue;
      const url = new URL(href, `https://schoolment.com/${slugs[index]}/`);
      const target = path.join(site, url.pathname, path.extname(url.pathname) ? '' : 'index.html');
      assert.ok(fs.existsSync(target), `Missing local link ${href}`);
      if (url.hash) assert.ok(fs.readFileSync(target, 'utf8').includes(`id="${url.hash.slice(1)}"`), `Missing target ${href}`);
    }
  }
});
