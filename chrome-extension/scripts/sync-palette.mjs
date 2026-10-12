import {readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const source = new URL('../../design/palette.css', import.meta.url);
const target = new URL('../palette.css', import.meta.url);
export function generatedPalette() {
  const text = readFileSync(source, 'utf8');
  if ((text.match(/@theme\s*\{/g) || []).length !== 1) throw new Error('Expected exactly one @theme block in design/palette.css.');
  return '/* Generated from design/palette.css. Do not edit by hand. */\n' + text.replace(/@theme\s*\{/, ':root {');
}
export function checkPalette() {
  return readFileSync(target, 'utf8') === generatedPalette();
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--check')) {
      if (!checkPalette()) throw new Error('palette.css is out of sync. Run node chrome-extension/scripts/sync-palette.mjs.');
      console.log('Palette check passed.');
    } else {
      writeFileSync(target, generatedPalette());
      console.log('Generated chrome-extension/palette.css.');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
