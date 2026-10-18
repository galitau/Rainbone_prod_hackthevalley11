const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const deferred = () => {let resolve; const promise = new Promise(r => {resolve=r;}); return {promise,resolve};};
const tick = async () => {for(let i=0;i<10;i++) await Promise.resolve();};
function page({outcome={ok:false,message:'Busy',busy:true}, history=async () => ({status:'ready',runs:[]}), sampleFails=false}={}) {
  const states=[],refs=[],calls=[]; let stateIndex=0;
  const imports={react:{useState(initial){const i=stateIndex++;states[i]=initial;return [initial,v=>{states[i]=v;}];},useRef(value){const ref={current:value};refs.push(ref);return ref;},useCallback:fn=>fn,useEffect(){}},
    'react/jsx-runtime':{jsx:(type,props)=>({type,props})},
    '@/components/dashboard':{Dashboard:()=>null},'@/lib/model':{},'@/lib/preferences':{readPreferences:()=>({autoRunSample:false})},
    '@/lib/simulation-history':{readBackSimulation:async()=>{}},
    '@/lib/api':{runSimulation:async()=>outcome,checkHealth:async()=>false,fetchHistory:async(...args)=>{calls.push(args);return history(...args);}}};
  const exports={};
  const source=fs.readFileSync(path.join(__dirname,'../app/dashboard/page.tsx'),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(code,{exports,require:name=>imports[name],fetch:async()=>{if(sampleFails)throw Error('sample unavailable');return {ok:true,blob:async()=>({})};},File:class{},window:{}});
  const element=exports.default();return {props:element.props,states,refs,calls};
}
test('429 and offline failures load previous filename history and carry busy status separately',async()=>{
  for(const busy of [true,undefined]){
    const saved={status:'ready',runs:[{source_filename:'upload.nii'}]};
    const p=page({outcome:{ok:false,message:'Unavailable',busy},history:async()=>saved});
    await p.props.onUpload({name:'upload.nii'});
    assert.equal(p.states[0].status,'error');assert.equal(p.states[0].busy,busy);
    assert.equal(p.states[3],saved);assert.deepEqual(p.calls,[[12,'upload.nii']]);
  }
});
test('sample download failure also resolves history loading',async()=>{
  const p=page({sampleFails:true});await p.props.onRunSample();
  assert.equal(p.states[0].status,'error');assert.equal(p.states[3].status,'ready');
  assert.deepEqual(p.calls,[[12,'sample_bone.nii.gz']]);
});
test('late fallback from prior upload never replaces newer upload history',async()=>{
  const first=deferred();let count=0;const latest={status:'ready',runs:[{run_id:'new'}]};
  const p=page({history:()=>++count===1?first.promise:Promise.resolve(latest)});
  const pending=p.props.onUpload({name:'old.nii'});await tick();
  await p.props.onUpload({name:'new.nii'});
  first.resolve({status:'ready',runs:[{run_id:'old'}]});await pending;
  assert.equal(p.states[3],latest);assert.equal(p.states[0].input.name,'new.nii');
});
test('unmounted page ignores late fallback completion',async()=>{
  const waiting=deferred();const p=page({history:()=>waiting.promise});
  const pending=p.props.onUpload({name:'upload.nii'});await tick();
  p.refs[1].current=false;waiting.resolve({status:'ready',runs:[]});await pending;
  assert.equal(p.states[3].status,'loading');
});
test('actual API turns HTTP429 Retry-After into structured not-started outcome',async()=>{
  const exports={};const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib/api.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,process:{env:{}},performance:{now:()=>0},FormData:class{append(){}},fetch:async()=>({ok:false,status:429,headers:{get:()=> '4'}})});
  const result=await exports.runSimulation({});assert.equal(result.ok,false);assert.equal(result.busy,true);assert.match(result.message,/wasn't started; try again in 4 s/);
});
