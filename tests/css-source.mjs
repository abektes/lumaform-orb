import { readFileSync, readdirSync } from 'node:fs';

export function readAllCss() {
  const root = new URL('../src/', import.meta.url);
  const parts = [readFileSync(new URL('style.css', root), 'utf8')];
  const dir = new URL('styles/', root);
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.css')).sort()) {
    parts.push(readFileSync(new URL(name, dir), 'utf8'));
  }
  return parts.join('\n');
}
