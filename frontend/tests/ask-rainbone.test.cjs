const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const payload = () => ({answer:'A checked statement [HFValid-Pat001].',provider:'gemini',model:'test-model',served:'cached',saved_at:null,sources:[{id:'HFValid-Pat001',label:'HFValid',kind:'published',url:'https://doi.org/10.6092/unibo/amsacta/8431'}],steps:['Read verified facts'],grounding:null,logged:null});
function loadUsage() {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/ask-usage.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports});
  return exports;
}
function load(fetch) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/ask-rainbone.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports = {};
  vm.runInNewContext(code,{exports,fetch,require:name => name === '@/lib/ask-usage' ? loadUsage() : ({apiUrl:path => `https://example.test${path}`})});
  return exports;
}
test('links allow exact known routes and citation, reject executable and lookalike URLs', () => {
  const lib = load();
  for (const route of lib.ASK_ROUTES) assert.equal(lib.checkedAskUrl(route),route);
  assert.equal(lib.checkedAskUrl(payload().sources[0].url),payload().sources[0].url);
  for (const url of ['https://pubmed.ncbi.nlm.nih.gov/8618384/','/models/hfvalid-femur/manifest.json']) assert.equal(lib.checkedAskUrl(url),url);
  for (const url of ['javascript:alert(1)','data:text/html,x','//evil.test','https://doi.org.evil.test/10.6092/unibo/amsacta/8431','/not-real','/bones?redirect=evil','https://evil.test']) assert.equal(lib.checkedAskUrl(url),undefined);
  const unsafe = payload(); unsafe.sources[0].url = 'javascript:alert(1)';
  assert.equal(lib.parseAskAnswer(unsafe).sources[0].url,undefined);
});
test('response validation preserves real steps/provider and rejects malformed or unverified provenance', () => {
  const lib = load(); const valid = payload();
  const parsed = lib.parseAskAnswer(valid);
  assert.equal(parsed.provider,'gemini'); assert.equal(parsed.served,'cached'); assert.equal(parsed.steps[0],'Read verified facts');
  for (const invalid of [null,{}, {...valid,answer:''},{...valid,steps:[{}]},{...valid,provider:'invented'},{...valid,sources:[{}]},{...valid,grounding:{store:'vultr-object-storage',verified:false,key:'x',sha256:'x'}},{...valid,logged:{store:'tiger'}}]) assert.throws(() => lib.parseAskAnswer(invalid));
});
test('request sends only bounded public case/page context and forwards abort signal', async () => {
  const calls = [];
  const lib = load(async (...args) => {calls.push(args); return {ok:true,status:200,json:async () => payload()};});
  const signal = new AbortController().signal;
  await lib.askRainbone('  What is this?  ','/bones',signal);
  assert.equal(calls[0][0],'https://example.test/api/ask');
  assert.equal(calls[0][1].signal,signal);
  assert.deepEqual(JSON.parse(calls[0][1].body),{question:'What is this?',case_id:'Pat001',page:'/bones'});
  await lib.askRainbone('Question','/unknown',signal);
  assert.equal('page' in JSON.parse(calls[1][1].body),false);
});
test('429 honors retry delay; unavailable facts and network errors are not answers', async () => {
  const limited = load(async () => ({status:429,headers:{get:() => '17'}}));
  await assert.rejects(limited.askRainbone('q','/bones',new AbortController().signal),/17 seconds/);
  const unavailable = load(async () => ({ok:false,status:503}));
  await assert.rejects(unavailable.askRainbone('q','/bones',new AbortController().signal),/facts are temporarily unavailable/);
  const offline = load(async () => {throw new TypeError('offline');});
  await assert.rejects(offline.askRainbone('q','/bones',new AbortController().signal),/offline/);
});
test('actual drawer handler wraps visible endpoints and preserves middle Tab navigation', () => {
  const jsx=(type,props)=>({type,props});let calls=0;const document={body:{},activeElement:null};
  const imports={react:{useEffect(){},useRef:current=>({current}),useState:value=>[calls++===0?true:value,()=>{}]},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'react-dom':{createPortal:node=>node},'next/navigation':{usePathname:()=>'/dashboard'},'lucide-react':{},'@/lib/ai-label':{},'@/lib/preferences':{useReducedMotion:()=>false},'@/lib/ask-rainbone':{},'@/components/grounding-line':{},'@/components/ask-usage-line':{}};
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../components/ask-rainbone.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,require:name=>imports[name],document,getComputedStyle:()=>({visibility:'visible'})});
  const dialog=exports.AskRainbone().props.children[1];
  const control=(visible=true)=>({tabIndex:0,getClientRects:()=>visible?[{}]:[],focus(){document.activeElement=this;}});
  const first=control(),middle=control(),last=control(),hidden=control(false),controls=[first,middle,last,hidden];
  dialog.props.ref.current={querySelectorAll:()=>controls,contains:node=>controls.includes(node),focus(){}};
  let prevented;const press=shiftKey=>{prevented=false;dialog.props.onKeyDown({key:'Tab',shiftKey,preventDefault(){prevented=true;}});};
  document.activeElement=first;press(true);assert.equal(document.activeElement,last);assert.equal(prevented,true);
  document.activeElement=last;press(false);assert.equal(document.activeElement,first);assert.equal(prevented,true);
  document.activeElement=middle;press(false);assert.equal(prevented,false);
  document.activeElement=document.body;press(true);assert.equal(document.activeElement,last);assert.equal(prevented,true);
});
test('structured execution trace preserves actual rules/tools/timings and remains optional', () => {
  const lib = load(), original = payload();
  assert.equal(lib.parseAskAnswer(original).trace, undefined);
  const trace = [{stage:'triage',tool:null,summary:'Rules selected the page guide',ms:0.2},{stage:'Evidence',tool:'get_page_guide',summary:'Read the cut-away controls',ms:1.1}];
  const parsed = lib.parseAskAnswer({...original,trace,tools_used:['get_page_guide']});
  assert.equal(parsed.trace[0].summary,'Rules selected the page guide');
  assert.equal('tool' in parsed.trace[0],false, 'Pydantic null tool becomes absent');
  assert.equal(parsed.trace[1].tool,'get_page_guide'); assert.equal(parsed.trace[1].ms,1.1);
  assert.equal(parsed.tools_used[0],'get_page_guide');
  for (const invalid of [[{...trace[0],ms:-1}],[{...trace[0],ms:Infinity}],[{...trace[0],summary:{}}],[{...trace[0],tool:{}}]]) assert.throws(() => lib.parseAskAnswer({...original,trace:invalid}));
  assert.throws(() => lib.parseAskAnswer({...original,tools_used:[{}]}));
});

function traceHarness(reduced = false) {
  const state = [], effects = [], timeouts = [], intervals = [], cleared = [];
  let cursor = 0;
  const jsx = (type, props) => ({type, props});
  const imports = {
    react: {useEffect: effect => effects.push(effect), useState: initial => {const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => {state[index] = value;}];}},
    'react/jsx-runtime': {jsx, jsxs: jsx}, 'react-dom': {}, 'next/navigation': {}, 'lucide-react': {},
    '@/lib/preferences': {useReducedMotion: () => reduced}, '@/lib/ai-label': {aiAnswerLabel: answer => `${answer.provider} · ${answer.served}`},
    '@/lib/ask-rainbone': {}, '@/components/grounding-line': {}, '@/components/ask-usage-line': {},
  };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../components/ask-rainbone.tsx'), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020}}).outputText;
  const exports = {};
  vm.runInNewContext(code, {exports, require: name => imports[name], performance: {now: () => 3500}, window: {
    setInterval: (fn, delay) => {intervals.push({fn, delay}); return intervals.length;}, clearInterval: id => cleared.push(['interval', id]),
    setTimeout: (fn, delay) => {timeouts.push({fn, delay}); return timeouts.length;}, clearTimeout: id => cleared.push(['timeout', id]),
  }});
  return {render(exchange) {cursor = 0; effects.length = 0; return exports.ExecutionTrace({exchange});}, effects, timeouts, intervals, cleared};
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}
function content(tree) {
  if (Array.isArray(tree)) return tree.map(content).join(' ');
  if (tree == null || typeof tree === 'boolean') return '';
  if (typeof tree !== 'object') return String(tree);
  return content(tree.props?.children);
}
test('pending execution measures elapsed time without inventing stage progress and releases its timer', () => {
  const harness = traceHarness(), exchange = {question: 'q', startedAt: 1000};
  let tree = harness.render(exchange);
  const cleanup = harness.effects[0]();
  tree = harness.render(exchange);
  assert.match(content(tree), /stage progress unavailable/);
  assert.match(content(tree), /2\.5\s+s/);
  assert.equal(nodes(tree).filter(node => node.props?.['data-stage']).length, 5);
  assert.ok(nodes(tree).filter(node => node.props?.['data-stage']).every(node => node.props['data-recorded'] === false));
  assert.equal(harness.timeouts.length, 0);
  cleanup(); assert.deepEqual(harness.cleared, [['interval', 1]]);
});
test('recorded events reveal in order with actual timing and cancel remaining reveal work', () => {
  const harness = traceHarness(), exchange = {question: 'q', startedAt: 0, elapsedMs: 2200, answer: {...payload(), trace: [
    {stage: 'triage', summary: 'Rules selected guide', ms: 7}, {stage: 'writer', summary: 'Gemini selected statements', ms: 121}, {stage: 'writer', summary: 'Provider attempt within writer duration', ms: 100},
  ]}};
  harness.render(exchange); const cleanup = harness.effects[1]();
  assert.deepEqual(harness.timeouts.map(timer => timer.delay), [0, 120, 240]);
  harness.timeouts[0].fn(); let tree = harness.render(exchange);
  const stages = nodes(tree).filter(node => node.props?.['data-stage']);
  assert.equal(stages[0].props['data-recorded'], true); assert.equal(stages[2].props['data-recorded'], false);
  assert.match(content(stages[0]), /7 ms/); assert.doesNotMatch(content(stages[2]), /No record/);
  harness.timeouts[1].fn(); harness.timeouts[2].fn(); tree = harness.render(exchange);
  assert.match(content(tree), /121 ms/); assert.match(content(tree), /2\.2\s+s/);
  assert.equal(nodes(tree).filter(node => node.props?.hidden === true).length, 0);
  const writer = nodes(tree).find(node => node.props?.['data-stage'] === 'writer');
  assert.match(content(writer), /121 ms/); assert.doesNotMatch(content(writer), /221 ms/);
  cleanup(); assert.equal(harness.cleared.length, 3);
});
test('reduced motion immediately shows cache-only execution without claiming tools reran', () => {
  const harness = traceHarness(true), exchange = {question: 'q', startedAt: 0, elapsedMs: 150, answer: {...payload(), trace: [
    {stage: 'cache', summary: 'Read saved answer; no provider request', ms: 4},
  ], tools_used: ['get_page_guide']}};
  const tree = harness.render(exchange); harness.effects.forEach(effect => effect());
  assert.equal(harness.timeouts.length, 0); assert.equal(harness.intervals.length, 0);
  assert.ok(nodes(tree).filter(node => node.props?.['data-stage']).every(node => node.props['data-recorded'] === false));
  assert.match(content(tree), /Read saved answer; no provider request/);
  assert.match(content(tree), /Evidence tools for this answer:.*get_page_guide/);
  assert.equal(nodes(tree).filter(node => node.props?.hidden === true).length, 0);
  assert.doesNotMatch(content(tree), /revealing recorded steps/);
});
test('fallback summary requires explicit Gemini 429 evidence and does not claim cache execution', () => {
  const render = (served, summary) => traceHarness(true).render({question:'q', startedAt:0, elapsedMs:100, answer:{...payload(),provider:'groq',served,trace:[{stage:'writer',summary,ms:10}]}});
  assert.match(content(render('live', 'Gemini HTTP 429; continued to backup')), /Gemini 429 → Groq/);
  assert.doesNotMatch(content(render('live', 'Gemini unavailable')), /Gemini 429 → Groq/);
  const cached = render('cached', 'Gemini HTTP 429 from earlier answer');
  assert.doesNotMatch(content(cached), /Gemini 429 → Groq/);
  assert.match(content(cached), /reused; no new writer call/);
  assert.equal(nodes(cached).find(node=>node.type==='details').props.open, undefined);
});
test('optional usage cannot break an answer and preserves original and current scopes', () => {
  const lib=load(), answer=payload();
  const writer={prompt_tokens:10,output_tokens:5,total_tokens:15,provider:'gemini',model:'test-model',source:'live',served:'saved'};
  const workflow={scope:'current_request',reuse:'none',calls:[{stage:'triage',provider:'gemini',model:'triage',usage:{prompt_tokens:2,output_tokens:1,total_tokens:3}}],reported_totals:{prompt_tokens:2,output_tokens:1,total_tokens:3},complete:true,incomplete_reasons:[]};
  const parsed=lib.parseAskAnswer({...answer,served:'saved',usage:writer,workflow_usage:workflow});
  assert.equal(parsed.usage.total_tokens,15); assert.equal(parsed.workflow_usage.reported_totals.total_tokens,3);
  for(const malformed of [null,{}, {total_tokens:-1}, Infinity]) {
    const fallback=lib.parseAskAnswer({...answer,usage:malformed,workflow_usage:malformed});
    assert.equal(fallback.answer,answer.answer); assert.equal(fallback.usage,undefined); assert.equal(fallback.workflow_usage,undefined);
  }
});

test('malformed optional usage discriminator objects cannot break valid answers', () => {
 const api=load();
 for (const invalid of [{toString:null},{},[],false,7,null]) {
  const answer=payload();
  const result=api.parseAskAnswer({...answer,
   workflow_usage:{scope:'current_request',reuse:invalid,calls:[],reported_totals:{prompt_tokens:0,output_tokens:0,total_tokens:0},complete:true,incomplete_reasons:[]},
   usage:{prompt_tokens:1,output_tokens:1,total_tokens:2,provider:'gemini',model:'test-model',source:'live',served:invalid}});
  assert.equal(result.answer,answer.answer);
  assert.equal(result.workflow_usage,undefined);
  assert.equal(result.usage,undefined);
 }
});
