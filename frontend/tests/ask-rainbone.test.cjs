const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const payload = () => ({answer:'A checked statement [HFValid-Pat001].',provider:'gemini',model:'test-model',served:'cached',saved_at:null,sources:[{id:'HFValid-Pat001',label:'HFValid',kind:'published',url:'https://doi.org/10.6092/unibo/amsacta/8431'}],steps:['Read verified facts'],grounding:null,logged:null});
function load(fetch) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/ask-rainbone.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports = {};
  vm.runInNewContext(code,{exports,fetch,require:() => ({apiUrl:path => `https://example.test${path}`})});
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
  const imports={react:{useEffect(){},useRef:current=>({current}),useState:value=>[calls++===0?true:value,()=>{}]},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},'react-dom':{createPortal:node=>node},'next/navigation':{usePathname:()=>'/dashboard'},'lucide-react':{},'@/lib/ai-label':{},'@/lib/ask-rainbone':{},'@/components/grounding-line':{}};
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
