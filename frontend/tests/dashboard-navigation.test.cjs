const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function mount(props) {
  let prefetches = 0;
  const effects = [];
  const jsx = (type, props) => typeof type === 'function' ? type(props || {}) : ({type, props: props || {}});
  const empty = new Proxy({}, {get: () => () => null});
  const imports = {
    react: {useEffect: effect => effects.push(effect), useMemo: make => make(), useRef: current => ({current})},
    'react/jsx-runtime': {jsx, jsxs: jsx, Fragment: 'fragment'},
    'next/link': {default: props => jsx('a', props)},
    'next/dynamic': {default: () => () => null},
    '@/lib/progression-cache': {prefetchProgressionFrames: () => { prefetches++; return Promise.resolve(); }},
    '@/lib/simulation-history': {matchingSimulationRuns: () => []},
    '@/lib/model': {FEMUR_MODEL: {dataset: 'HFValid', caseId: 'Pat001', anatomy: 'Femur'}, FEMUR_AUTHORS: 'Research authors'},
    '@/components/overview-layout': {
      CollapsiblePanel: () => null, PanelSplitter: () => null,
      useOverviewLayout: () => ({collapsed: {}, panelWidth: 360, reset() {}, setCollapsed() {}, setPanelWidth() {}}),
    },
  };
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../components/dashboard.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020,
  }}).outputText, {exports, require: name => imports[name] || empty});
  const tree = exports.Dashboard(props);
  effects.forEach(effect => effect());
  const nodes = [];
  function walk(node) {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    walk(node.props?.children);
  }
  walk(tree);
  return {nodes, prefetches: () => prefetches};
}

const overview = {
  run: {status: 'idle', input: {name: 'sample', kind: 'sample'}},
  explanation: {status: 'idle'}, risk: {status: 'idle'}, history: {status: 'idle'},
  health: 'checking', onRunSample() {}, onUpload() {},
};

test('dashboard and preferences mount without fetching lesion frames; both navigation layouts warm on intent', () => {
  for (const props of [overview, {view: 'preferences'}]) {
    const rendered = mount(props);
    assert.equal(rendered.prefetches(), 0);
    const links = rendered.nodes.filter(node => node.type === 'a');
    const lesionLinks = links.filter(node => node.props.href === '/lesion-progression');
    assert.equal(lesionLinks.length, 2, 'desktop and mobile links are rendered');
    for (const link of links.filter(node => node.props.href !== '/lesion-progression')) {
      link.props.onPointerEnter?.();
      link.props.onFocus?.();
    }
    assert.equal(rendered.prefetches(), 0, 'unrelated links do not fetch lesion frames');
    for (const link of lesionLinks) {
      assert.equal(typeof link.props.onPointerEnter, 'function');
      assert.equal(typeof link.props.onFocus, 'function');
      const before = rendered.prefetches();
      link.props.onPointerEnter();
      assert.equal(rendered.prefetches(), before + 1);
      link.props.onFocus();
      assert.equal(rendered.prefetches(), before + 2);
    }
  }
});

test('progression breadcrumb names the illustrative case instead of the reference femur', () => {
  const rendered = mount({view: 'progression'});
  const breadcrumb = rendered.nodes.find(node => node.props['aria-label'] === 'Breadcrumb');
  assert.ok(breadcrumb);
  const content = JSON.stringify(breadcrumb);
  assert.match(content, /Case 006f52e910 \(illustrative\)/);
  assert.doesNotMatch(content, /HFValid|Pat001/);
});
