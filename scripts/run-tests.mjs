// Runs every packages/*/tests/*.test.mjs and fails if any of them fails.
//
// The previous shell for-loop (`for t in tests/*.test.mjs; do node "$t" || echo
// FAILED; done`) always exited 0, so CI would report success on a red suite.
// This propagates the failure.
import { readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const packages = readdirSync('packages');
let failures = 0;
let total = 0;

for (const pkg of packages) {
  const dir = `packages/${pkg}/tests`;
  if (!existsSync(dir)) continue;

  for (const file of readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort()) {
    const path = `${dir}/${file}`;
    total++;
    try {
      execFileSync('node', [path], { stdio: 'inherit' });
    } catch {
      console.error(`FAILED: ${path}`);
      failures++;
    }
  }
}

console.log(
  failures === 0
    ? `\nALL SUITES PASS (${total})`
    : `\n${failures} of ${total} SUITE(S) FAILED`
);
process.exit(failures ? 1 : 0);
