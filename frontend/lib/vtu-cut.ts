// Minimal reader + plane slicer for the solved tetrahedral femur (bone-fea.vtu).
// vtk.js has no unstructured-grid reader or cutter, so the cross-section cap is built here.

export type TetMesh = {
  points: Float64Array; // xyz per node
  tets: Int32Array; // 4 node ids per element
  stress: Float64Array; // nodal von Mises, MPa
  displacement: Float64Array; // nodal displacement magnitude, mm
};

export type Cap = { points: Float32Array; triangles: Uint32Array; stress: Float32Array; displacement: Float32Array };

const BYTES: Record<string, number> = { Int32: 4, Int64: 8, Float32: 4, Float64: 8 };

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function base64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// meshio writes: base64(header: nBlocks, blockSize, lastBlockSize, compressedSizes...) then base64(zlib blocks).
async function decodeArray(xml: string, name: string): Promise<{ values: ArrayBufferLike; type: string }> {
  const match = new RegExp(`<DataArray[^>]*Name="${name}"[^>]*>([^<]*)</DataArray>`).exec(xml);
  if (!match) throw new Error(`The volume mesh is missing "${name}".`);
  const type = /type="(\w+)"/.exec(match[0])![1];
  const text = match[1].replace(/\s+/g, "");
  const head = new DataView(base64(text.slice(0, 16)).buffer);
  const blocks = head.getUint32(0, true);
  const headerChars = 4 * Math.ceil(((3 + blocks) * 4) / 3);
  const header = new DataView(base64(text.slice(0, headerChars)).buffer);
  const data = base64(text.slice(headerChars));
  const total = (blocks - 1) * header.getUint32(4, true) + header.getUint32(8, true);
  const out = new Uint8Array(total);
  let source = 0, target = 0;
  for (let i = 0; i < blocks; i++) {
    const size = header.getUint32(12 + i * 4, true);
    const block = await inflate(data.subarray(source, source + size));
    out.set(block, target);
    source += size; target += block.length;
  }
  return { values: out.buffer, type };
}

export async function parseTetMesh(xml: string): Promise<TetMesh> {
  const read = async (name: string) => {
    const { values, type } = await decodeArray(xml, name);
    if (!BYTES[type]) throw new Error(`Unsupported array type ${type}.`);
    return { values, type };
  };
  const points = new Float64Array((await read("Points")).values);
  const tets = new Int32Array((await read("connectivity")).values);
  const stress = new Float64Array((await read("von_mises_nodal_mpa")).values);
  const vectors = new Float64Array((await read("displacement_mm")).values);
  const displacement = new Float64Array(points.length / 3);
  for (let i = 0; i < displacement.length; i++) displacement[i] = Math.hypot(vectors[3 * i], vectors[3 * i + 1], vectors[3 * i + 2]);
  if (tets.length !== 4 * Number(/NumberOfCells="(\d+)"/.exec(xml)?.[1])) throw new Error("The volume mesh is not purely tetrahedral.");
  return { points, tets, stress, displacement };
}

// Marching-tetrahedra cut of every element by the plane n·(x - o) = 0.
export function sliceTets(mesh: TetMesh, origin: number[], normal: number[]): Cap {
  const { points, tets, stress, displacement } = mesh;
  const nodeCount = points.length / 3;
  const signed = new Float64Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    signed[i] = normal[0] * (points[3 * i] - origin[0]) + normal[1] * (points[3 * i + 1] - origin[1]) + normal[2] * (points[3 * i + 2] - origin[2]);
  }
  const pts: number[] = [], tri: number[] = [], vm: number[] = [], disp: number[] = [];
  const crossing = (a: number, b: number) => {
    const t = signed[a] / (signed[a] - signed[b]);
    for (let k = 0; k < 3; k++) pts.push(points[3 * a + k] + t * (points[3 * b + k] - points[3 * a + k]));
    vm.push(stress[a] + t * (stress[b] - stress[a]));
    disp.push(displacement[a] + t * (displacement[b] - displacement[a]));
    return pts.length / 3 - 1;
  };
  for (let e = 0; e < tets.length; e += 4) {
    const ids = [tets[e], tets[e + 1], tets[e + 2], tets[e + 3]];
    const above = ids.filter(id => signed[id] > 0), below = ids.filter(id => signed[id] <= 0);
    if (!above.length || !below.length) continue;
    if (above.length === 1 || below.length === 1) {
      const lone = above.length === 1 ? above[0] : below[0];
      const rest = above.length === 1 ? below : above;
      tri.push(crossing(lone, rest[0]), crossing(lone, rest[1]), crossing(lone, rest[2]));
    } else {
      const [a, b] = above, [c, d] = below;
      const ac = crossing(a, c), ad = crossing(a, d), bd = crossing(b, d), bc = crossing(b, c);
      tri.push(ac, ad, bd, ac, bd, bc);
    }
  }
  return { points: Float32Array.from(pts), triangles: Uint32Array.from(tri), stress: Float32Array.from(vm), displacement: Float32Array.from(disp) };
}
