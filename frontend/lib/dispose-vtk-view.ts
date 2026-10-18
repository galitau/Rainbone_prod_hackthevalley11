import type vtkGenericRenderWindow from "@kitware/vtk.js/Rendering/Misc/GenericRenderWindow";

// GenericRenderWindow owns the OpenGL view, but not these core objects.
// Capture them before deletion clears the generic window's getters.
export function createVtkViewDisposer(view: vtkGenericRenderWindow): () => void {
  const interactor = view.getInteractor();
  const style = interactor.getInteractorStyle();
  const renderer = view.getRenderer();
  const renderWindow = view.getRenderWindow();
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    interactor.disable();
    // vtk 37 delete() misses the short post-wheel RAF tail. This public
    // runtime method cancels RAF unconditionally (typings still use VR).
    (interactor as typeof interactor & { switchToXRAnimation: () => void }).switchToXRAnimation();
    // Unbind DOM events/timers and delete OpenGL before deleting the interactor.
    view.delete();
    interactor.delete();
    style.delete();
    renderer.delete();
    renderWindow.delete();
  };
}
