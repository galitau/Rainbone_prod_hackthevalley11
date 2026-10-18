const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, imports = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../lib', file), 'utf8');
  const output = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
  const module = {exports: {}};
  new Function('require', 'module', 'exports', output)(name => imports[name], module, module.exports);
  return module.exports;
}

const format = load('format.ts');
const {usageLine, usageWhy, GEMINI_PROMPT_FOOTPRINT} = load('ai-usage.ts', {'@/lib/format': format});

const usage = (over = {}) => ({prompt_tokens: 480, output_tokens: 132, thinking_tokens: 40, total_tokens: 612,
  provider: 'gemini', model: 'gemini-3.8-flash', source: 'live', served: 'live', ...over});

test('a live Gemini answer shows its tokens and the labelled per-prompt estimate', () => {
  assert.deepEqual(usageLine({provider: 'gemini', served: 'live', usage: usage()}),
    {text: 'This answer: 612 tokens (480 in · 132 out)', estimate: 'for scale, not measured for this answer: a median Gemini Apps text prompt ≈ 0.24 Wh, 0.03 gCO2e', why: usageWhy('gemini')});
  assert.equal(usageLine({provider: 'gemini', served: 'live', usage: usage({total_tokens: 1234, prompt_tokens: 1100, output_tokens: 134})}).text,
    'This answer: 1,234 tokens (1,100 in · 134 out)');
});

test('the estimate is Google\'s published median, cited, never scaled per token', () => {
  assert.equal(GEMINI_PROMPT_FOOTPRINT.wh, 0.24);
  assert.equal(GEMINI_PROMPT_FOOTPRINT.gco2e, 0.03);
  assert.match(GEMINI_PROMPT_FOOTPRINT.url, /^https:\/\/cloud\.google\.com\/blog\/products\/infrastructure\/measuring-the-environmental-impact-of-ai-inference$/);
  const small = usageLine({provider: 'gemini', served: 'live', usage: usage({total_tokens: 10})});
  assert.equal(small.estimate, 'for scale, not measured for this answer: a median Gemini Apps text prompt ≈ 0.24 Wh, 0.03 gCO2e');
  assert.match(usageWhy('gemini'), /code computes every number; Gemini only writes the words/);
  assert.match(usageWhy('groq'), /code computes every number; the AI model only writes the words/);
});

test('a cached answer made no new call; a saved one does not claim that', () => {
  const cached = {text: 'Reused — no new Gemini call', estimate: null, why: null};
  assert.deepEqual(usageLine({provider: 'gemini', served: 'cached', usage: usage({served: 'cached'})}), cached);
  assert.deepEqual(usageLine({provider: 'gemini', served: 'cached', usage: null}), cached);
  assert.equal(usageLine({provider: 'groq', served: 'cached'}).text, 'Reused — no new model call');
  // A saved answer is served after the live models failed or were skipped, so Gemini may have been called.
  const saved = {text: 'Saved answer reused — its tokens were counted when it was written', estimate: null, why: null};
  assert.deepEqual(usageLine({provider: 'gemini', served: 'saved', usage: usage({served: 'saved'})}), saved);
  assert.deepEqual(usageLine({provider: 'gemini', served: 'saved', usage: null}), saved);
});

test('Groq shows tokens without the Gemini estimate', () => {
  assert.deepEqual(usageLine({provider: 'groq', served: 'live', usage: usage({provider: 'groq', total_tokens: 420, prompt_tokens: 300, output_tokens: 120})}),
    {text: 'This answer: 420 tokens (300 in · 120 out)', estimate: null, why: usageWhy('groq')});
});

test('nothing for the template, an older API or a live answer without a reported total', () => {
  assert.equal(usageLine({provider: 'template', served: 'live', usage: null}), null);
  assert.equal(usageLine({provider: 'template', served: 'cached'}), null);
  assert.equal(usageLine({provider: 'gemini', served: 'live'}), null);
  assert.equal(usageLine({provider: 'gemini'}), null);
  assert.equal(usageLine({provider: 'gemini', served: 'live', usage: usage({total_tokens: null})}), null);
  assert.equal(usageLine({provider: 'gemini', served: 'live', usage: usage({prompt_tokens: null, output_tokens: null})}).text,
    'This answer: 612 tokens');
});
