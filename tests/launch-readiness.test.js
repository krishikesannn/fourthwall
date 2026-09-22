import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const marketingPages = ['index.html', 'about.html', 'services.html', 'projects.html', 'process.html', 'faq.html', 'contact.html'];

const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('marketing pages have complete discoverability and social metadata', () => {
  for (const file of marketingPages) {
    const html = read(file);
    assert.match(html, /<title>[^<]+<\/title>/i, `${file}: title`);
    assert.match(html, /<meta\s+name="description"\s+content="[^"]+"/i, `${file}: description`);
    assert.match(html, /<link\s+rel="canonical"\s+href="https:\/\/fourthwall\.pages\.dev\//i, `${file}: canonical`);
    assert.match(html, /property="og:title"/i, `${file}: Open Graph title`);
    assert.match(html, /property="og:image"\s+content="https:\/\/fourthwall\.pages\.dev\/assets\/images\/og-fourth-wall\.jpg"/i, `${file}: preview image`);
    assert.match(html, /name="twitter:card"\s+content="summary_large_image"/i, `${file}: Twitter card`);
    assert.match(html, /rel="icon"[^>]+pwa\/icon\.svg/i, `${file}: favicon`);
  }
});

test('every content image has an alt attribute and every local resource exists', () => {
  const pages = [...marketingPages, 'privacy.html', 'terms.html', '404.html'];
  for (const file of pages) {
    const html = read(file);
    for (const match of html.matchAll(/<img\b[^>]*>/gis)) {
      assert.match(match[0], /\balt=("[^"]*"|'[^']*')/i, `${file}: ${match[0]}`);
    }
    for (const match of html.matchAll(/\b(?:src|href)=("|')([^"']+)\1/gis)) {
      let target = match[2].split(/[?#]/)[0];
      if (!target || target.endsWith('_URL') || /^(?:https?:|mailto:|tel:|javascript:|data:)/i.test(target) || target.startsWith('#')) continue;
      if (target === '/') target = 'index.html';
      else if (target.startsWith('/')) target = target.slice(1);
      if (target.endsWith('/')) target += 'index.html';
      assert.ok(fs.existsSync(path.join(root, target)), `${file}: missing ${target}`);
    }
  }
});

test('launch safety, legal, consent, validation and anti-spam controls are present', () => {
  for (const file of ['privacy.html', 'terms.html', '404.html', 'robots.txt', 'sitemap.xml', '_headers']) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} exists`);
  }
  const headers = read('_headers');
  assert.match(headers, /Strict-Transport-Security:/);
  assert.match(headers, /Content-Security-Policy:/);
  assert.match(read('scripts/main.js'), /tfw-cookie-consent/);
  assert.match(read('scripts/main.js'), /static\.cloudflareinsights\.com/);
  assert.match(read('scripts/interactions.js'), /reportValidity\(\)/);
  assert.match(read('contact.html'), /name="website"/i);
  assert.match(read('scripts/main.js'), /a\[href\$="_URL"\][^\n]+remove\(\)/);
});

test('the sitemap only publishes real canonical pages', () => {
  const sitemap = read('sitemap.xml');
  const urls = [...sitemap.matchAll(/<loc>https:\/\/fourthwall\.pages\.dev\/(.*?)<\/loc>/g)].map(match => match[1] || 'index.html');
  assert.ok(urls.length >= marketingPages.length);
  for (const url of urls) assert.ok(fs.existsSync(path.join(root, url || 'index.html')), url);
});

test('case-study hero preserves the transparent collage on mobile browsers', () => {
  const html = read('projects.html');
  assert.match(html, /<picture>\s*<source[^>]+assets\/images\/harsha-hero\.png[^>]+type="image\/png"/is);
  assert.match(html, /<img[^>]+assets\/images\/harsha-hero\.png[^>]+class="harsha-hero__main-img"/is);
  // No flat fill behind the collage: a solid colour shows as a box on the textured paper.
  const refinements = read('styles/refinements.css');
  assert.match(refinements, /\.harsha-hero__visual\s*\{[^}]*background:\s*transparent/);
});

test('homepage collage tile uses a transparent image with no card behind it', () => {
  const html = read('index.html');
  assert.match(html, /work-scatter__item--tr[\s\S]*?assets\/images\/harsha-hero-620\.webp/);
  assert.doesNotMatch(html, /harsha-hero-900\.jpg/);
  const sections = read('styles/sections.css');
  assert.match(sections, /\.work-scatter__item--tr\s*\{[^}]*background:\s*transparent[^}]*box-shadow:\s*none/);
});
