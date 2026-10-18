const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {pathToFileURL} = require('node:url');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '../lib/dispose-vtk-view.ts'), 'utf8');
const code = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS}}).outputText;
const exported = {};
vm.runInNewContext(code, {exports: exported});

test('installed vtk animation tails are cancelled before retiring the view; all core objects delete once', async () => {
  const globals = ['document', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const previous = globals.map(key => Object.getOwnPropertyDescriptor(globalThis, key));
  const pending = new Map(); let nextId = 0;
  globalThis.document = {hidden:false, addEventListener(){}, removeEventListener(){}};
  globalThis.requestAnimationFrame = callback => { pending.set(++nextId, callback); return nextId; };
  globalThis.cancelAnimationFrame = id => pending.delete(id);
  try {
    const modulePath = require.resolve('@kitware/vtk.js/Rendering/Core/RenderWindowInteractor.js');
    const {default: Interactor} = await import(pathToFileURL(modulePath).href);
    const {default: Style} = await import(pathToFileURL(require.resolve('@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera.js')).href);
    // Reproduce the actual vtk37 defect, independently of the application helper.
    const baseline = Interactor.newInstance();
    baseline.extendAnimation(600); baseline.disable(); baseline.delete();
    assert.equal(pending.size, 1, 'vtk delete alone leaves its wheel tail scheduled');
    pending.clear();
    for (const mode of ['wheel', 'drag', 'both']) {
      const interactor = Interactor.newInstance();
      if (mode !== 'drag') interactor.extendAnimation(600);
      if (mode !== 'wheel') interactor.requestAnimation('drag');
      assert.equal(pending.size, 1);
      const deleted = [];
      const resource = name => ({delete() { deleted.push(name); }});
      const style = Style.newInstance(), renderer = resource('renderer'), window = resource('window');
      interactor.setInteractorStyle(style);
      // Generic window requires a real WebGL DOM. Its documented deletion
      // boundary is represented here; the animation object itself is real vtk.
      const view = {
        getInteractor: () => interactor,
        getRenderer: () => renderer,
        getRenderWindow: () => window,
        delete() {
          assert.equal(pending.size, 0, 'RAF must stop before OpenGL is removed');
          assert.equal(interactor.isDeleted(), false, 'generic window still needs interactor to unbind');
          deleted.push('view');
        },
      };
      const dispose = exported.createVtkViewDisposer(view);
      dispose(); dispose();
      assert.equal(pending.size, 0);
      assert.equal(interactor.isDeleted(), true);
      assert.equal(style.isDeleted(), true);
      assert.deepEqual(deleted, ['view', 'renderer', 'window']);
    }
  } finally {
    globals.forEach((key, i) => previous[i] ? Object.defineProperty(globalThis, key, previous[i]) : delete globalThis[key]);
  }
});
