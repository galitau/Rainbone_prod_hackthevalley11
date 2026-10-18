const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');

// Exercise the actual TypeScript modules without a browser or another test dependency.
function loadModule(name, globals = {}, modules = {}) {
  const source = readFileSync(join(__dirname, '../lib', name + '.ts'), 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  runInNewContext(output, { exports, require: name => modules[name], ...globals });
  return exports;
}

function cacheWith(fetch) {
  const api = loadModule('api', { process: { env: { NEXT_PUBLIC_API_BASE_URL: 'https://rainbone.health/' } } });
  return loadModule('progression-cache', { fetch }, { '@/lib/api': api });
}

test('frames use the configured API and share an in-flight request', async () => {
  const requests = [];
  const bytes = new ArrayBuffer(8);
  const cache = cacheWith(async url => {
    requests.push(url);
    return { ok: true, arrayBuffer: async () => bytes };
  });
  const first = cache.getProgressionFrame(3);
  assert.equal(first, cache.getProgressionFrame(3));
  assert.equal(await first, bytes);
  assert.deepEqual(requests, ['https://rainbone.health/api/progression/frames/3.vtp']);
});

test('a failed frame can be retried instead of poisoning the cache', async () => {
  let attempts = 0;
  const cache = cacheWith(async () => ++attempts === 1
    ? { ok: false, status: 503 }
    : { ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  await assert.rejects(cache.getProgressionFrame(0), /503/);
  assert.equal((await cache.getProgressionFrame(0)).byteLength, 8);
  assert.equal(attempts, 2);
});

test('timeline rejects malformed coordinates and retains both endpoints', () => {
  const { generateProgressionTimeline } = loadModule('progression-data');
  for (const point of [undefined, [1, 2], [1, 2, NaN], [1, Infinity, 3], ['1', 2, 3]]) {
    assert.throws(() => generateProgressionTimeline(point, [4, 5, 6]), /three finite numbers/);
    assert.throws(() => generateProgressionTimeline([1, 2, 3], point), /three finite numbers/);
  }
  const timeline = generateProgressionTimeline([1, 2, 3], [4, 5, 6]);
  assert.equal(timeline.length, 8);
  assert.deepEqual(Array.from(timeline[0].point), [1, 2, 3]);
  assert.deepEqual(Array.from(timeline[7].point), [4, 5, 6]);
});
