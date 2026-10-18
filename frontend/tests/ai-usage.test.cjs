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
const {usageLine, GEMINI_PROMPT_FOOTPRINT, USAGE_WHY} = load('ai-usage.ts', {'@/lib/format': format});

const usage = (over = {}) => ({prompt_tokens: 480, output_tokens: 132, thinking_tokens: 40, total_tokens: 612,
  provider: 'gemini', model: 'gemini-3.8-flash', source: 'live', served: 'live', new_tokens: 612, ...over});

test('a live Gemini answer shows its tokens and the labelled per-prompt estimate', () => {
  assert.deepEqual(usageLine({provider: 'gemini', served: 'live', usage: usage()}),
    {text: 'This answer: 612 tokens (480 in · 132 out)', estimate: 'est. ≈ 0.24 Wh, 0.03 gCO2e'});
  assert.equal(usageLine({provider: 'gemini', served: 'live', usage: usage({total_tokens: 1234, prompt_tokens: 1100, output_tokens: 134})}).text,
    'This answer: 1,234 tokens (1,100 in · 134 out)');
});

test('the estimate is Google\'s published median, cited, never scaled per token', () => {
  assert.equal(GEMINI_PROMPT_FOOTPRINT.wh, 0.24);
  assert.equal(GEMINI_PROMPT_FOOTPRINT.gco2e, 0.03);
  assert.match(GEMINI_PROMPT_FOOTPRINT.url, /^https:\/\/cloud\.google\.com\/blog\/products\/infrastructure\/measuring-the-environmental-impact-of-ai-inference$/);
  const small = usageLine({provider: 'gemini', served: 'live', usage: usage({total_tokens: 10})});
  assert.equal(small.estimate, 'est. ≈ 0.24 Wh, 0.03 gCO2e');
  assert.match(USAGE_WHY, /code computes every number; Gemini only writes the words/);
});

test('a reused answer made no new call', () => {
  for (const served of ['cached', 'saved']) {
    assert.deepEqual(usageLine({provider: 'gemini', served, usage: usage({served, new_tokens: 0})}),
      {text: 'Reused — no new Gemini call', estimate: null});
    assert.deepEqual(usageLine({provider: 'gemini', served, usage: null}), {text: 'Reused — no new Gemini call', estimate: null});
  }
  assert.equal(usageLine({provider: 'groq', served: 'cached'}).text, 'Reused — no new model call');
});

test('Groq shows tokens without the Gemini estimate', () => {
  assert.deepEqual(usageLine({provider: 'groq', served: 'live', usage: usage({provider: 'groq', total_tokens: 420, prompt_tokens: 300, output_tokens: 120})}),
    {text: 'This answer: 420 tokens (300 in · 120 out)', estimate: null});
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
