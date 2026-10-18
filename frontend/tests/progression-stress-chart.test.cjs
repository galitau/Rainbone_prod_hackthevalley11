const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), ts=require('typescript');
const jsx=(type,props)=>({type,props});
const exportsForTest={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../components/stress-chart.tsx'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsForTest,require:()=>({jsx,jsxs:jsx})});
function nodes(node){return Array.isArray(node)?node.flatMap(nodes):node&&typeof node==='object'?[node,...nodes(node.props?.children)]:[];}
test('timeline uses actual month spacing and values, moving cursor and accessible value together',()=>{
 const timeline=[{month:0,peakVonMisesMPa:20},{month:3,peakVonMisesMPa:10},{month:12,peakVonMisesMPa:5}];
 const render=activeMonth=>nodes(exportsForTest.StressChart({activeMonth,timeline}));
 const first=render(0),last=render(12);
 const points=first.find(n=>n.type==='polyline').props.points.split(' ').map(p=>p.split(',').map(Number));
 assert.deepEqual(points.map(p=>p[0]),[0,25,100]);
 assert.ok(points[0][1]<points[1][1]&&points[1][1]<points[2][1]);
 assert.equal(first.find(n=>n.type==='line').props.x1,0); assert.equal(last.find(n=>n.type==='line').props.x1,100);
 assert.match(last.find(n=>n.type==='svg').props['aria-label'],/Selected month 12: 5.0 MPa; not solved clinical stress/);
});
test('empty, zero and single-frame values do not produce invalid SVG coordinates',()=>{
 const empty=exportsForTest.StressChart({activeMonth:0,timeline:[]});
 assert.match(empty.props.children,/unavailable/);
 for(const timeline of [[{month:4,peakVonMisesMPa:0}],[{month:0,peakVonMisesMPa:NaN},{month:4,peakVonMisesMPa:10}]]){
  const plot=nodes(exportsForTest.StressChart({activeMonth:Infinity,timeline})).find(n=>n.type==='polyline');
  assert.doesNotMatch(plot.props.points,/NaN|Infinity/);
 }
});
test('normal saved-history branch remains available and empty history remains hidden',()=>{
 assert.equal(exportsForTest.StressChart({runs:[],name:'sample'}),null);
 const run={time:'2026-10-18T12:00:00Z',run_id:'real-id',source_filename:'sample',max_von_mises_stress_mpa:12};
 const result=exportsForTest.StressChart({runs:[run],name:'sample',matchKind:'run'});
 assert.equal(result.props['aria-label'],'Saved simulation runs');
 assert.ok(nodes(result).some(n=>n.type==='table'));
});
