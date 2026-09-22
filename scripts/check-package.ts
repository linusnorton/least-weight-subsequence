/**
 * Packs the library, installs the tarball into a scratch project and consumes it
 * the way a real dependant would.
 *
 * The unit tests import from `src`, so they cannot catch a broken `exports` map,
 * a missing entry in `files`, or declarations that were never emitted. This
 * checks the artifact that actually gets published.
 *
 * Verified to fail on: a removed `./async` subpath, `dist` missing from `files`,
 * and a build that emits no `.d.ts`. It will not catch a wrong `types` path while
 * a matching declaration still sits next to the JavaScript, because TypeScript
 * finds that on its own.
 *
 *   npm run check:package
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'lws-package-'));
const run = (cmd: string, args: string[], cwd: string): string =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });

try {
  run('npm', ['run', 'build'], root);

  const tarball = run('npm', ['pack', '--silent', '--pack-destination', dir], root).trim();

  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify({ name: 'consumer', version: '1.0.0', private: true, type: 'module' }),
  );
  run('npm', ['install', '--no-audit', '--no-fund', '--silent', join(dir, tarball)], dir);

  writeFileSync(
    join(dir, 'smoke.mjs'),
    `import assert from 'node:assert/strict';
import { leastWeightSubsequence, NoPathError } from 'least-weight-subsequence';
import { leastWeightSubsequenceAsync, NoPathError as AsyncNoPathError } from 'least-weight-subsequence/async';

const weights = { A: { B: 100, C: 900 }, B: { C: 100 } };
const get = (from, to) => weights[from]?.[to] ?? Infinity;
const expected = [[['A', 'B'], 100], [['B', 'C'], 100]];

assert.deepEqual(leastWeightSubsequence(['A', 'B', 'C'], get), expected);
assert.deepEqual(await leastWeightSubsequenceAsync(['A', 'B', 'C'], async (f, t) => get(f, t)), expected);

// The README promises instanceof works across both entry points.
assert.equal(NoPathError, AsyncNoPathError, 'NoPathError differs between entry points');
assert.throws(() => leastWeightSubsequence(['A', 'B'], () => Infinity), NoPathError);
await assert.rejects(leastWeightSubsequenceAsync(['A', 'B'], async () => Infinity), NoPathError);

console.log('runtime: both entry points resolve and behave');
`,
  );
  run('node', ['smoke.mjs'], dir);

  writeFileSync(
    join(dir, 'consumer.ts'),
    `import { leastWeightSubsequence } from 'least-weight-subsequence';
import { leastWeightSubsequenceAsync } from 'least-weight-subsequence/async';
import type { NodeId, Segment } from 'least-weight-subsequence';

const path: NodeId[] = ['A', 'B'];
const sync: Segment[] = leastWeightSubsequence(path, () => 1);
const async: Promise<Segment[]> = leastWeightSubsequenceAsync(path, async () => 1);
void sync;
void async;
`,
  );
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'nodenext',
        moduleResolution: 'nodenext',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ['consumer.ts'],
    }),
  );
  run('node', [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], dir);
  console.log('types: both entry points resolve under nodenext');

  console.log('package check passed');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
