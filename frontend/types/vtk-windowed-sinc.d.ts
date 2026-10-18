// vtk.js ships WindowedSincPolyDataFilter without TypeScript declarations.
declare module "@kitware/vtk.js/Filters/General/WindowedSincPolyDataFilter" {
  import type { vtkAlgorithm, vtkObject } from "@kitware/vtk.js/interfaces";
  type vtkWindowedSincPolyDataFilter = vtkObject & vtkAlgorithm;
  const vtkWindowedSincPolyDataFilter: {
    newInstance(initialValues?: {
      numberOfIterations?: number;
      passBand?: number;
      featureEdgeSmoothing?: boolean;
      boundarySmoothing?: boolean;
      nonManifoldSmoothing?: boolean;
      normalizeCoordinates?: boolean;
    }): vtkWindowedSincPolyDataFilter;
  };
  export default vtkWindowedSincPolyDataFilter;
}

// PolyDataNormals ships without TypeScript declarations as well.
declare module "@kitware/vtk.js/Filters/Core/PolyDataNormals" {
  import type { vtkAlgorithm, vtkObject } from "@kitware/vtk.js/interfaces";
  type vtkPolyDataNormals = vtkObject & vtkAlgorithm;
  const vtkPolyDataNormals: {
    newInstance(initialValues?: { computePointNormals?: boolean; computeCellNormals?: boolean }): vtkPolyDataNormals;
  };
  export default vtkPolyDataNormals;
}
