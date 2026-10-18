const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), path = require('node:path');
function load(file, imports = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, file), 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.ReactJSX, target:ts.ScriptTarget.ES2020}}).outputText, {exports, require:name=>imports[name]});
  return exports;
}
const lib = load('../lib/ask-usage.ts');
const counts = () => ({prompt_tokens:20, output_tokens:10, thinking_tokens:5, total_tokens:30});
const sample = () => ({scope:'current_request',reuse:'none',calls:[{stage:'triage',provider:'gemini',model:'triage-model',usage:counts()},{stage:'writer',provider:'groq',model:'writer-model',usage:{...counts(),thinking_tokens:null}}],reported_totals:{prompt_tokens:40,output_tokens:20,thinking_tokens:5,total_tokens:60},complete:true,incomplete_reasons:[]});
test('mixed providers remain attributed and thinking is not added again', () => {
 const result=lib.parseWorkflowUsage(sample());
 assert.equal(result.reported_totals.total_tokens,60); assert.equal(result.calls[1].provider,'groq');
 assert.match(lib.workflowUsageLabel(result), /60 provider-reported tokens from returned generations/);
 assert.equal(result.complete,true);
});
test('old missing and malformed telemetry is omitted safely', () => {
 for (const value of [undefined,null,{}, {...sample(),scope:'original_answer'}]) assert.equal(lib.parseWorkflowUsage(value),undefined);
 for (const n of [-1,Infinity,NaN,1.5,'30']) {
  const value=sample(); value.calls[0].usage.total_tokens=n; assert.equal(lib.parseWorkflowUsage(value),undefined);
  const totals=sample(); totals.reported_totals.prompt_tokens=n; assert.equal(lib.parseWorkflowUsage(totals),undefined);
 }
 const critic=sample(); critic.calls[0].stage='critic'; assert.equal(lib.parseWorkflowUsage(critic),undefined);
});
test('missing counts and failures downgrade completeness without fabricating zero', () => {
 const value=sample(); value.calls[0].usage=null; value.reported_totals.total_tokens=null;
 const result=lib.parseWorkflowUsage(value); assert.equal(result.complete,false); assert.equal(result.calls[0].usage,null);
 assert.match(lib.workflowUsageLabel(result),/usage unavailable/);
 const failed=sample(); failed.incomplete_reasons=['failed_attempt'];
 assert.match(lib.workflowUsageLabel(lib.parseWorkflowUsage(failed)),/Reported subtotal:.*some usage unavailable/);
});
test('cache and joined requests distinguish newly started work from original computation', () => {
 for (const reuse of ['cache','in_flight']) {
  const value={...sample(),reuse,calls:[],reported_totals:{prompt_tokens:0,output_tokens:0,total_tokens:0}};
  const result=lib.parseWorkflowUsage(value); assert.ok(result);
  assert.match(lib.workflowUsageLabel(result),reuse==='cache'?/Cached answer; no new model work/:/Shared an ongoing answer; this request started no additional model work/);
  assert.equal(lib.parseWorkflowUsage({...value,calls:sample().calls}),undefined);
 }
});
test('footer is absent for older API and shows optional details without environmental claims', () => {
 const jsx=(type,props)=>({type,props});
 const component=load('../components/ask-usage-line.tsx',{'@/lib/ask-usage':lib,'react/jsx-runtime':{jsx,jsxs:jsx}});
 assert.equal(component.AskUsageLine({}),null);
 const tree=component.AskUsageLine({workflowUsage:sample()});
 const text=JSON.stringify(tree);
 assert.match(text,/Code check; no model call/); assert.match(text,/triage-model/); assert.match(text,/writer-model/);
 assert.doesNotMatch(text,/carbon|emissions|water/i);
});
test('original writer usage is validated and separated in optional details', () => {
 const writer={...counts(),provider:'gemini',model:'original-model',source:'live',served:'saved'};
 assert.equal(lib.parseAskWriterUsage(writer).total_tokens,30);
 for (const n of [-1,Infinity,NaN,1.5]) assert.equal(lib.parseAskWriterUsage({...writer,total_tokens:n}),undefined);
 const jsx=(type,props)=>({type,props});
 const component=load('../components/ask-usage-line.tsx',{'@/lib/ask-usage':lib,'react/jsx-runtime':{jsx,jsxs:jsx}});
 const tree=component.AskUsageLine({workflowUsage:sample(),writerUsage:writer});
 const text=JSON.stringify(tree);
 assert.match(text,/30 tokens from original generation/); assert.match(text,/reused/); assert.match(text,/60 provider-reported/);
 assert.match(text,/not added to this request subtotal/);
});
