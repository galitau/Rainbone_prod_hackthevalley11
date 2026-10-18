const PROGRESSION_API = "http://127.0.0.1:8000/api/progression";
const frameCache = new Map<number, Promise<ArrayBuffer>>();

function loadFrame(frameIndex: number): Promise<ArrayBuffer> {
  const existing = frameCache.get(frameIndex);
  if (existing) return existing;

  const request = fetch(`${PROGRESSION_API}/frames/${frameIndex}.vtp`)
    .then(async response => {
      if (!response.ok) {
        throw new Error(`VTP frame request failed (${response.status}).`);
      }
      return response.arrayBuffer();
    })
    .catch(error => {
      frameCache.delete(frameIndex);
      throw error;
    });

  frameCache.set(frameIndex, request);
  return request;
}

export function getProgressionFrame(frameIndex: number): Promise<ArrayBuffer> {
  return loadFrame(frameIndex);
}

export async function prefetchProgressionFrames(): Promise<void> {
  const pending = Array.from({ length: 8 }, (_, frameIndex) => frameIndex);
  const workers = Array.from({ length: 2 }, async () => {
    while (pending.length > 0) {
      const frameIndex = pending.shift();
      if (frameIndex === undefined) return;
      try {
        await loadFrame(frameIndex);
      } catch {
        // The active viewer retries failed frames and displays the error.
      }
    }
  });
  await Promise.all(workers);
}
