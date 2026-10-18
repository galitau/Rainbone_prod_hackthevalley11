const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const frontend = path.join(__dirname, '..');
function load(filename, imports = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(frontend, filename), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020},
  }).outputText;
  vm.runInNewContext(code, {exports, URL, require: name => {
    if (!(name in imports)) throw new Error(`Unexpected runtime import: ${name}`);
    return imports[name];
  }});
  return exports;
}

const seo = load('lib/seo.ts');
const sitemap = load('app/sitemap.ts', {'@/lib/seo': seo}).default;
const robots = load('app/robots.ts').default;

function actualPages(directory, segments = []) {
  const pages = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    if (entry.isDirectory()) pages.push(...actualPages(path.join(directory, entry.name), [...segments, entry.name]));
    else if (entry.name === 'page.tsx') {
      pages.push('/' + segments.filter(segment => !segment.startsWith('(')).join('/'));
    }
  }
  return pages;
}

test('public catalogue covers actual pages while excluding the login redirect', () => {
  const pages = actualPages(path.join(frontend, 'app')).filter(route => route !== '/login');
  const routes = Array.from(seo.PUBLIC_ROUTES, route => route.path);
  assert.equal(new Set(routes).size, routes.length);
  assert.deepEqual(routes.sort(), pages.sort());
  assert.ok(!routes.some(route => route === '/health' || route.startsWith('/api/')));
});

test('every route has a distinct canonical and matching social preview metadata', () => {
  const titles = new Set();
  for (const route of seo.PUBLIC_ROUTES) {
    const metadata = seo.pageMetadata(route.path);
    const canonical = new URL(route.path, 'https://rainbone.health').href;
    assert.equal(metadata.alternates.canonical, canonical);
    assert.equal(metadata.title.absolute, route.title);
    assert.ok(route.description.length > 30);
    titles.add(metadata.title.absolute);
    assert.equal(metadata.openGraph.url, canonical);
    assert.equal(metadata.openGraph.title, route.title);
    assert.equal(metadata.openGraph.description, route.description);
    assert.equal(metadata.twitter.title, route.title);
    assert.equal(metadata.twitter.card, 'summary_large_image');
    for (const image of [...metadata.openGraph.images, ...metadata.twitter.images]) {
      assert.equal(image.url, 'https://rainbone.health/opengraph-image');
      assert.equal(image.width, 1200);
      assert.equal(image.height, 630);
    }
  }
  assert.equal(titles.size, seo.PUBLIC_ROUTES.length);
  assert.throws(() => seo.pageMetadata('/api/ask'), /Missing public route metadata/);
});

test('sitemap contains only canonical public pages and no invented last-modified timestamps', () => {
  const entries = sitemap();
  const expected = Array.from(seo.PUBLIC_ROUTES, route => new URL(route.path, 'https://rainbone.health').href);
  assert.deepEqual(Array.from(entries, entry => entry.url).sort(), expected.sort());
  for (const entry of entries) assert.ok(!Object.hasOwn(entry, 'lastModified'));
});

test('robots allows public pages, excludes API and health, and links the production sitemap', () => {
  const result = robots();
  assert.equal(result.rules.userAgent, '*');
  assert.equal(result.rules.allow, '/');
  assert.deepEqual(Array.from(result.rules.disallow).sort(), ['/api/', '/health']);
  assert.equal(result.sitemap, 'https://rainbone.health/sitemap.xml');
});
