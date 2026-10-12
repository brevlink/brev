import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve, relative, dirname, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {DEFAULT_SERVER} from '../api.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const problems = [];
const problem = (message) => problems.push(message);
const walk = (directory) => readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
  const path = resolve(directory, entry.name);
  return entry.isDirectory() ? walk(path) : [path];
});
const files = walk(root).sort();
const label = (file) => relative(root, file);
function referenced(path, owner = 'manifest.json') {
  if (typeof path !== 'string') { problem(`${owner}: invalid file reference.`); return; }
  const absolute = resolve(root, path);
  if (relative(root, absolute).startsWith('..') || !existsSync(absolute)) problem(`${owner}: missing or invalid file ${path}.`);
}
let manifest;
try { manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8')); }
catch (error) { problem(`manifest.json: ${error.message}`); }
if (manifest) {
  if (manifest.manifest_version !== 3) problem('manifest.json: manifest_version must be 3.');
  if (manifest.minimum_chrome_version !== '116') problem('manifest.json: minimum_chrome_version must be 116.');
  const allowed = ['activeTab', 'storage', 'contextMenus', 'clipboardWrite', 'offscreen'];
  const actual = manifest.permissions;
  if (!Array.isArray(actual) || actual.length !== allowed.length || new Set(actual).size !== allowed.length || allowed.some((permission) => !actual.includes(permission))) {
    problem(`manifest.json: permissions must be exactly ${allowed.join(', ')}.`);
  }
  if (JSON.stringify(manifest.host_permissions) !== JSON.stringify([`${DEFAULT_SERVER}/*`])) problem('manifest.json: host_permissions must contain only the Brev origin.');
  if (JSON.stringify(manifest.optional_host_permissions) !== JSON.stringify(['https', 'http'].map((scheme) => `${scheme}://*/*`))) problem('manifest.json: optional host permissions must be HTTP and HTTPS origins.');
  if (!manifest.background?.service_worker || manifest.background.type !== 'module') problem('manifest.json: a module service worker is required.');
  if (!manifest.action?.default_popup || !manifest.options_ui?.page) problem('manifest.json: popup and options page are required.');
  // All MV3 file-bearing fields, including future optional additions.
  for (const path of [manifest.background?.service_worker, manifest.action?.default_popup, manifest.options_ui?.page, manifest.options_page, manifest.devtools_page].filter(Boolean)) referenced(path);
  for (const group of [manifest.icons, manifest.action?.default_icon]) {
    if (typeof group === 'string') referenced(group);
    else for (const path of Object.values(group || {})) referenced(path);
  }
  for (const path of Object.values(manifest.chrome_url_overrides || {})) referenced(path);
  if (manifest.side_panel?.default_path) referenced(manifest.side_panel.default_path);
  for (const icon of manifest.action?.theme_icons || []) for (const path of [icon.light, icon.dark].filter(Boolean)) referenced(path);
  for (const script of manifest.content_scripts || []) for (const path of [...(script.js || []), ...(script.css || [])]) referenced(path);
  for (const path of manifest.sandbox?.pages || []) referenced(path);
  for (const resource of manifest.web_accessible_resources || []) {
    for (const path of resource.resources || []) {
      if (path.includes('*')) {
        const regex = new RegExp('^' + path.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
        if (!files.some((file) => regex.test(label(file)))) problem(`manifest.json: resource pattern ${path} matches no file.`);
      } else referenced(path);
    }
  }
}

for (const file of files.filter((path) => extname(path) === '.html')) {
  const html = readFileSync(file, 'utf8');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (match[2].trim() || !/\bsrc\s*=/.test(match[1])) problem(`${label(file)}: inline script is forbidden.`);
  }
  if (/\s+on[a-z]+\s*=/i.test(html)) problem(`${label(file)}: inline event handler is forbidden.`);
  if (/javascript\s*:/i.test(html)) problem(`${label(file)}: javascript: URL is forbidden.`);
  for (const match of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    if (/^(?:https?:|\/\/)/i.test(match[1])) problem(`${label(file)}: remote HTML resource is forbidden.`);
    else if (!/^(?:data:|#)/i.test(match[1])) {
      const target = relative(root, resolve(dirname(file), match[1]));
      referenced(target, label(file));
    }
  }
}
let defaultConstants = 0;
for (const file of files.filter((path) => ['.js', '.mjs'].includes(extname(path)))) {
  const text = readFileSync(file, 'utf8');
  // Remove comments, preserving strings. Conservative scanning also catches
  // forbidden constructs in strings, so no parser dependency is needed.
  const code = text.replace(/(['"`])(?:\\[\s\S]|(?!\1)[^\\])*?\1|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (match) => match.startsWith('//') || match.startsWith('/*') ? ' ' : match);
  // This checker itself holds the forbidden patterns as regex source, not calls.
  for (const [pattern, name] of [
    [/\beval\s*\(/, 'eval call'], [/\bnew\s+Function\s*\(/, 'Function constructor'], [/\bdocument\s*\.\s*write\s*\(/, 'document.write call']
  ]) if (pattern.test(code)) problem(`${label(file)}: ${name} is forbidden.`);
  const sanitized = code.replace(/export const DEFAULT_SERVER = 'https:\/\/brevl\.ink';/, (match) => {
    if (label(file) === 'api.js') { defaultConstants += 1; return ''; }
    return match;
  });
  if (/https?:\/\/[^\s'"`<>]+/i.test(sanitized)) problem(`${label(file)}: remote HTTP URL in code is forbidden; use DEFAULT_SERVER.`);
  const syntax = spawnSync(process.execPath, ['--check', file], {encoding: 'utf8'});
  if (syntax.status !== 0) problem(`${label(file)}: JavaScript syntax check failed: ${syntax.stderr.trim()}`);
}
if (defaultConstants !== 1) problem('api.js: exactly one DEFAULT_SERVER constant is required.');
const palette = spawnSync(process.execPath, [resolve(root, 'scripts/sync-palette.mjs'), '--check'], {encoding: 'utf8'});
if (palette.status !== 0) problem(`palette.css: ${palette.stderr.trim() || palette.error?.message || 'palette check failed.'}`);
for (const size of [16, 32, 48, 128]) {
  const path = resolve(root, `icons/icon${size}.png`);
  try {
    const png = readFileSync(path);
    if (png.length < 33 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || png.toString('ascii', 12, 16) !== 'IHDR') {
      problem(`icons/icon${size}.png: invalid PNG header.`);
    } else if (png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size) problem(`icons/icon${size}.png: expected square ${size}x${size} PNG.`);
  } catch (error) { problem(`icons/icon${size}.png: ${error.message}`); }
}
if (problems.length) {
  console.error(`Validation failed (${problems.length} problems):\n${problems.map((item) => `- ${item}`).join('\n')}`);
  process.exitCode = 1;
} else console.log(`Validation passed: Manifest V3, exact permissions, HTML/JS safety, palette and 4 PNG icons (${files.length} files checked).`);
