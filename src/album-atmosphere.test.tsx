import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  atmosphereFromPixels,
  contrast,
  defaultAtmosphere,
  loadAtmosphere,
} from "./album-atmosphere";
import { useAlbumAtmosphere } from "./use-album-atmosphere";

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("times out stalled loads and releases image handlers", async () => {
  vi.useFakeTimers();
  const { loaded } = images();
  const stalled = loadAtmosphere("asset://stalled");
  await vi.advanceTimersByTimeAsync(10000);
  expect(await stalled).toEqual(defaultAtmosphere);
  expect(loaded[0].onload).toBeNull();
  expect(loaded[0].onerror).toBeNull();
  expect(loaded[0].hasAttribute("src")).toBe(false);
});

it("bounds cached themes while retaining recent artwork", async () => {
  const { loaded } = images();
  for (let i = 0; i < 129; i++) {
    const pending = loadAtmosphere(`asset://bounded-${i}`);
    loaded.at(-1)!.dispatchEvent(new Event("load"));
    await pending;
  }
  await loadAtmosphere("asset://bounded-128");
  expect(loaded).toHaveLength(129);
  const evicted = loadAtmosphere("asset://bounded-0");
  expect(loaded).toHaveLength(130);
  loaded.at(-1)!.dispatchEvent(new Event("load"));
  await evicted;
});
const pixels = (rgb: number[], count = 100) =>
  Array.from({ length: count }, () => [...rgb, 255]).flat();
const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];

it("derives distinct warm, cool and pale palettes with readable text", () => {
  const themes = [
    [230, 60, 25],
    [50, 70, 210],
    [215, 200, 170],
  ].map((colour) => atmosphereFromPixels(pixels(colour)));
  expect(new Set(themes.map((t) => t.background)).size).toBe(3);
  for (const t of [...themes, defaultAtmosphere]) {
    expect(contrast(rgb(t.accent), rgb(t.onAccent))).toBeGreaterThanOrEqual(
      4.5,
    );
    for (const surface of [t.background, t.surface]) {
      expect(contrast(rgb(t.accent), rgb(surface))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(rgb(t.muted), rgb(surface))).toBeGreaterThanOrEqual(4.5);
      expect(contrast([248, 247, 250], rgb(surface))).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  }
});
it("uses the Graphite fallback for monochrome, transparent and empty art", () => {
  expect(defaultAtmosphere.accent).toBe("#eeeeee");
  for (const sample of [
    [],
    [255, 0, 0, 0],
    ...[0, 120, 255].map((v) => pixels([v, v, v])),
  ]) {
    expect(atmosphereFromPixels(sample)).toEqual(defaultAtmosphere);
  }
});
it("selects a stable populated hue from busy art instead of averaging opposing hues", () => {
  const warm = pixels([220, 50, 20], 60),
    cool = pixels([20, 50, 220], 40);
  expect(atmosphereFromPixels([...warm, ...cool])).toEqual(
    atmosphereFromPixels([...cool, ...warm]),
  );
  expect(atmosphereFromPixels([...warm, ...cool])).toEqual(
    atmosphereFromPixels(warm),
  );
});

function images() {
  const loaded: HTMLImageElement[] = [];
  vi.stubGlobal(
    "Image",
    class {
      constructor() {
        const image = document.createElement("img");
        loaded.push(image);
        return image;
      }
    },
  );
  const context = {
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: pixels([230, 50, 20]) })),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  return { loaded, context };
}
it("shares extraction and reuses completed content identity", async () => {
  const { loaded, context } = images();
  const first = loadAtmosphere("asset://cache-test");
  expect(loaded[0].crossOrigin).toBe("anonymous");
  expect(loadAtmosphere("asset://cache-test")).toBe(first);
  loaded[0].dispatchEvent(new Event("load"));
  expect(await first).not.toEqual(defaultAtmosphere);
  await loadAtmosphere("asset://cache-test");
  expect(loaded).toHaveLength(1);
  expect(context.drawImage).toHaveBeenCalledOnce();
  expect(loaded[0].onload).toBeNull();
});
it("immediately resets on navigation and ignores late and unmounted results", async () => {
  const { loaded } = images();
  const { result, rerender, unmount } = renderHook(
    ({ source }) => useAlbumAtmosphere(source),
    { initialProps: { source: "asset://race-a" } },
  );
  await act(async () => {
    loaded[0].dispatchEvent(new Event("load"));
  });
  expect(result.current).not.toEqual(defaultAtmosphere);
  rerender({ source: "asset://race-b" });
  expect(result.current).toEqual(defaultAtmosphere);
  rerender({ source: "asset://race-c" });
  await act(async () => {
    loaded[1].dispatchEvent(new Event("load"));
  });
  expect(result.current).toEqual(defaultAtmosphere);
  await act(async () => {
    loaded[2].dispatchEvent(new Event("load"));
  });
  await waitFor(() => expect(result.current).not.toEqual(defaultAtmosphere));
  rerender({ source: "asset://race-unmount" });
  unmount();
  await act(async () => {
    loaded[3].dispatchEvent(new Event("load"));
  });
});
it("handles image failures, tainted canvas and HTTP CORS", async () => {
  const { loaded, context } = images();
  const failure = loadAtmosphere("https://example.test/failure.jpg");
  expect(loaded[0].crossOrigin).toBe("anonymous");
  loaded[0].dispatchEvent(new Event("error"));
  expect(await failure).toEqual(defaultAtmosphere);
  context.getImageData.mockImplementation(() => {
    throw new DOMException("tainted", "SecurityError");
  });
  const tainted = loadAtmosphere("asset://tainted");
  loaded[1].dispatchEvent(new Event("load"));
  expect(await tainted).toEqual(defaultAtmosphere);
});
