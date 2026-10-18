const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function harness(raw = null, blocked = false, dark = false) {
  let stored = raw;
  const classes = new Set(), attrs = {}, events = new Map(), media = new Map();
  const effects = [], subscriptions = [];
  const root = { classList: { toggle(k, on) { on ? classes.add(k) : classes.delete(k); } }, setAttribute(k, v) { attrs[k] = v; } };
  const storage = {
    getItem() { if (blocked) throw Error('blocked'); return stored; },
    setItem(k, v) { if (blocked) throw Error('blocked'); stored = v; },
    removeItem() { if (blocked) throw Error('blocked'); stored = null; },
  };
  const window = { localStorage: storage,
    addEventListener(k, f) { events.set(k, f); }, removeEventListener(k) { events.delete(k); },
    matchMedia(q) {
      if (!media.has(q)) media.set(q, { matches: q.includes('color-scheme') && dark, listeners: new Set(),
        addEventListener(_, f) { this.listeners.add(f); }, removeEventListener(_, f) { this.listeners.delete(f); } });
      return media.get(q);
    },
  };
  const context = vm.createContext({window, localStorage: storage, document: { documentElement: root }});
  function load(file, imports = {}) {
    const source = fs.readFileSync(path.join(__dirname, '../lib', file), 'utf8');
    const output = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
    const module = {exports: {}};
    vm.runInContext(`(function(require,module,exports){${output}\n})`, context)(name => imports[name], module, module.exports);
    return module.exports;
  }
  const script = load('preferences-script.ts');
  const runtime = load('preferences.ts', {'@/lib/preferences-script': script, react: {
    useEffect(fn) { effects.push(fn()); },
    useSyncExternalStore(subscribe, snapshot) { subscriptions.push({subscribe, snapshot}); return snapshot(); },
  }});
  return {runtime, script, attrs, classes, effects, subscriptions,
    bootstrap() { vm.runInContext(script.PREFERENCES_SCRIPT, context); },
    changeMedia(q, matches) { const m = window.matchMedia(q); m.matches = matches; m.listeners.forEach(f => f({matches})); },
    crossTab(value, key = script.PREFERENCES_KEY) { stored = value; events.get('storage')?.({key}); },
    stored() { return stored; },
  };
}
const darkQuery = '(prefers-color-scheme: dark)';
const motionQuery = '(prefers-reduced-motion: reduce)';

test('bootstrap and runtime agree for defaults, legacy, invalid and all themes', () => {
  for (const raw of [null, '{broken', 'null', '[]', '4', '{"theme":"unknown"}', '{"textSize":"large"}', ...['light','dark','high-contrast','system'].map(theme => JSON.stringify({theme, reduceMotion:'always'}))]) {
    for (const dark of [false,true]) {
      const h = harness(raw, false, dark); h.bootstrap();
      const initial = JSON.stringify([h.attrs, [...h.classes]]);
      h.runtime.applyPreferences(h.runtime.readPreferences());
      assert.equal(JSON.stringify([h.attrs, [...h.classes]]), initial, raw);
    }
  }
  const h = harness(null, false, true); h.bootstrap(); assert.equal(h.attrs['data-theme'], 'light');
});

test('blocked storage still applies default, supports session changes and reset', () => {
  const h = harness(null, true, true); h.bootstrap();
  assert.equal(h.attrs['data-theme'], 'light');
  assert.equal(h.runtime.savePreferences({...h.runtime.DEFAULT_PREFERENCES, theme:'dark'}), false);
  assert.equal(h.runtime.readPreferences().theme, 'dark');
  assert.equal(h.attrs['data-theme'], 'dark');
  assert.equal(h.runtime.resetPreferences(), false);
  assert.equal(h.attrs['data-theme'], 'light');
});

test('theme persists; OS changes affect system only; cross-tab reset and cleanup work', () => {
  const h = harness(); h.runtime.PreferencesSync();
  h.runtime.savePreferences({...h.runtime.DEFAULT_PREFERENCES, theme:'system'});
  assert.equal(JSON.parse(h.stored()).theme, 'system');
  h.changeMedia(darkQuery, true); assert.equal(h.attrs['data-theme'], 'dark');
  h.runtime.savePreferences({...h.runtime.DEFAULT_PREFERENCES, theme:'high-contrast'});
  h.changeMedia(darkQuery, false); assert.equal(h.attrs['data-theme'], 'high-contrast');
  h.crossTab('{"theme":"dark","textSize":"large"}');
  assert.equal(h.attrs['data-theme'], 'dark'); assert.ok(h.classes.has('pref-text-large'));
  h.crossTab(null, null); assert.equal(h.attrs['data-theme'], 'light');
  assert.equal(h.runtime.resetPreferences(), true); assert.equal(h.stored(), null);
  h.effects.forEach(cleanup => cleanup());
  h.crossTab('{"theme":"dark"}'); assert.equal(h.attrs['data-theme'], 'light');
});

test('reduced-motion hook follows OS and always preference, then unsubscribes', () => {
  const h = harness(); assert.equal(h.runtime.useReducedMotion(), false);
  const {subscribe, snapshot} = h.subscriptions[0]; let updates = 0;
  const cleanup = subscribe(() => updates++);
  h.changeMedia(motionQuery, true); assert.equal(snapshot(), true); assert.equal(updates, 1);
  h.runtime.savePreferences({...h.runtime.DEFAULT_PREFERENCES, reduceMotion:'always'});
  h.changeMedia(motionQuery, false); assert.equal(snapshot(), true);
  h.runtime.resetPreferences(); assert.equal(snapshot(), false);
  cleanup(); const before = updates;
  h.changeMedia(motionQuery, true); assert.equal(updates, before);
});
