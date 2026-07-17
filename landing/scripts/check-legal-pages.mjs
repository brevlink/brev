import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const pages = ['privacy', 'terms', 'cookies', 'legal', 'subprocessors'];
const requiredPlaceholder = '[DA COMPLETARE]';

for (const page of pages) {
  const file = path.join(root, 'src', 'pages', `${page}.astro`);
  assert(fs.existsSync(file), `Missing legal page: ${file}`);
  const source = fs.readFileSync(file, 'utf8');
  assert(source.includes("import LegalLayout from '../components/LegalLayout.astro';"), `${page} must use LegalLayout`);
  assert(source.includes(requiredPlaceholder), `${page} must retain explicit placeholders`);
}

const landing = fs.readFileSync(path.join(root, 'src', 'pages', 'index.astro'), 'utf8');
for (const route of pages.map((page) => `/${page}`)) {
  assert(landing.includes(`href="${route}"`), `Landing footer is missing ${route}`);
}
assert(landing.includes('github.com/brevlink/brev/security/advisories/new'), 'Landing footer is missing security reporting');

const caddyfile = fs.readFileSync(path.join(root, '..', 'Caddyfile'), 'utf8');
const legalMatcher = caddyfile.match(/@legal path ([^\n]+)/)?.[1] ?? '';
for (const page of pages) {
  assert(legalMatcher.includes(`/${page}`), `Caddy legal routing is missing /${page}`);
  assert(legalMatcher.includes(`/${page}/`), `Caddy legal routing is missing /${page}/`);
}
assert(caddyfile.indexOf('@legal path') < caddyfile.indexOf('@short path_regexp'), 'Caddy legal routes must precede short-link routing');

const sourcesToCheck = [
  path.join(root, 'src'),
  path.join(root, '..', 'dashboard', 'index.html'),
];
for (const sourcePath of sourcesToCheck) {
  const content = fs.statSync(sourcePath).isDirectory()
    ? fs.readdirSync(sourcePath, { recursive: true }).filter((entry) => /\.(astro|css|html|js|jsx)$/.test(entry)).map((entry) => fs.readFileSync(path.join(sourcePath, entry), 'utf8')).join('\n')
    : fs.readFileSync(sourcePath, 'utf8');
  assert(!content.includes('fonts.googleapis.com'), `${sourcePath} must not load Google Fonts`);
  assert(!content.includes('fonts.gstatic.com'), `${sourcePath} must not load Google Fonts assets`);
}

console.log(`Checked ${pages.length} legal pages, landing links, security reporting, and third-party font references.`);
