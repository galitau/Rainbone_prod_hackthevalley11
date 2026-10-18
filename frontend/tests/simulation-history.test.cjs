const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const row = (extra = {}) => ({time:'2026-10-18T10:00:00Z',source_filename:'scan.nii',max_von_mises_stress_mpa:12,run_id:'own',input_sha256:'abc',...extra});
const result = (extra = {}) => ({run_id:'own',input_sha256:'abc',persistence:'pending',...extra});
const response = body => ({ok:true,json:async () => body});
function harness(fetcher = async () => response({runs:[]})) {
  let now = 0; const calls = [], timeouts = [];
  class Clock extends Date { static now() { return now; } }
  const context = vm.createContext({process:{env:{NEXT_PUBLIC_API_BASE_URL:'https://example.test'}},URLSearchParams,Date:Clock,
    AbortSignal:{timeout(ms) { timeouts.push(ms); return {timeoutMs:ms}; }},
    fetch:async (...args) => {calls.push(args); return fetcher(...args);},
    setTimeout(fn,ms) {now += ms; queueMicrotask(fn);}});
  function load(name, imports = {}) {
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname,'../lib',name),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
    const exports = {}; vm.runInContext(`(function(exports,require){${code}\n})`,context)(exports,key => imports[key]); return exports;
  }
  const api = load('api.ts');
  return {api,history:load('simulation-history.ts',{'@/lib/api':api}),calls,timeouts,now:() => now};
}
test('exact run and hash exclude filename competitors and accept renamed input; legacy remains filename based', () => {
  const {history} = harness();
  const rows = [row({run_id:'other'}),row({input_sha256:'wrong'}),row({source_filename:'original.nii'}),row({run_id:undefined})];
  const matches = history.matchingSimulationRuns({status:'ready',runs:rows},result(),'scan.nii');
  assert.equal(matches.length,1); assert.equal(matches[0],rows[2]);
  assert.equal(history.matchingSimulationRuns({status:'loading'},result(),'scan.nii').length,0);
  assert.equal(history.matchingSimulationRuns({status:'ready',runs:rows},undefined,'scan.nii').length,3);
});
test('API prioritizes encoded run ID, preserves identity and persistence, and encodes legacy filenames', async () => {
  const h = harness(async () => response({runs:[row()],persistence:'saved'}));
  const next = await h.api.fetchHistory(7,'name & space.nii',321,'run&=?');
  const query = new URL(h.calls[0][0]).searchParams;
  assert.equal(query.get('run_id'),'run&=?'); assert.equal(query.has('source_filename'),false); assert.equal(query.get('limit'),'7');
  assert.equal(h.timeouts[0],321); assert.equal(next.persistence,'saved'); assert.equal(next.runs[0].input_sha256,'abc');
  await h.api.fetchHistory(12,'name & space.nii');
  assert.equal(new URL(h.calls[1][0]).searchParams.get('source_filename'),'name & space.nii');
});
test('readback waits through competitor then stops at exact identity', async () => {
  let attempt = 0;
  const h = harness(async () => response({runs:[row(++attempt === 1 ? {run_id:'competitor'} : {})]}));
  const updates = [];
  await h.history.readBackSimulation(result(),'renamed.nii',x => updates.push(x),() => true);
  assert.equal(h.calls.length,2); assert.equal(updates[1].runs[0].run_id,'own'); assert.deepEqual(h.timeouts,[5000,4500]);
});
test('pending polling ends at five seconds; legacy requests read only once using original filename', async () => {
  const h = harness();
  await h.history.readBackSimulation(result(),'scan.nii',() => {},() => true);
  assert.equal(h.now(),5000); assert.equal(h.calls.length,10); assert.equal(h.timeouts.at(-1),500);
  const legacy = harness(async () => response({runs:[row()]}));
  await legacy.history.readBackSimulation(result({run_id:undefined,original_source_filename:'old.nii'}),'new.nii',() => {},() => true);
  assert.equal(legacy.calls.length,1); assert.equal(new URL(legacy.calls[0][0]).searchParams.get('source_filename'),'old.nii');
});
test('known unavailable persistence never fetches; failed fetch or unavailable save terminates readback', async () => {
  const h = harness(), updates = [];
  await h.history.readBackSimulation(result({persistence:'unavailable'}),'scan.nii',x => updates.push(x),() => true);
  assert.equal(h.calls.length,0); assert.equal(updates[0].status,'unavailable');
  for (const fetcher of [async () => {throw Error('offline');},async () => response({runs:[],persistence:'unavailable'})]) {
    const failed = harness(fetcher);
    await failed.history.readBackSimulation(result(),'scan.nii',() => {},() => true);
    assert.equal(failed.calls.length,1); assert.equal(failed.now(),0);
  }
});
test('superseded in-flight response cannot update state or poll again', async () => {
  let finish, current = true;
  const h = harness(() => new Promise(resolve => {finish = resolve;})), updates = [];
  const pending = h.history.readBackSimulation(result(),'scan.nii',x => updates.push(x),() => current);
  assert.equal(h.calls.length,1); current = false; finish(response({runs:[row()]})); await pending;
  assert.equal(updates.length,0); assert.equal(h.calls.length,1);
  await h.history.readBackSimulation(result(),'scan.nii',x => updates.push(x),() => false);
  assert.equal(h.calls.length,1);
});
