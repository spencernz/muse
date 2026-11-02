export type AlbumAtmosphere = {
  accent: string;
  onAccent: string;
  background: string;
  surface: string;
  muted: string;
};
type RGB = readonly [number, number, number];
const hex = (rgb: RGB) =>
  `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: RGB, b: RGB, amount: number): RGB =>
  [0, 1, 2].map((i) => a[i] * (1 - amount) + b[i] * amount) as [
    number,
    number,
    number,
  ];
const white: RGB = [248, 247, 250];
const ink: RGB = [18, 18, 22];

export function luminance(rgb: RGB) {
  const linear = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
export function contrast(a: RGB, b: RGB) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function derive(colour: RGB): AlbumAtmosphere {
  const background = mix(ink, colour, 0.12);
  const surface = mix(ink, colour, 0.24);
  let accent = mix(colour, white, 0.28);
  // Allow a rounding margin above 4.5:1 for ordinary text on surfaces.
  while (contrast(accent, surface) < 4.6) accent = mix(accent, white, 0.1);
  const onAccent =
    contrast(ink, accent) >= contrast(white, accent) ? ink : white;
  let muted = mix(colour, white, 0.72);
  while (contrast(muted, surface) < 4.6) muted = mix(muted, white, 0.1);
  return {
    accent: hex(accent),
    onAccent: hex(onAccent),
    background: hex(background),
    surface: hex(surface),
    muted: hex(muted),
  };
}

export const defaultAtmosphere: AlbumAtmosphere = {
  accent: "#eeeeee",
  onAccent: "#111111",
  background: "#151515",
  surface: "#222222",
  muted: "#aaaaaa",
};

/** Quantized, population-weighted colour buckets keep competing hues separate. */
export function atmosphereFromPixels(
  pixels: ArrayLike<number>,
): AlbumAtmosphere {
  const buckets = new Map<string, { sum: number[]; weight: number }>();
  for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3] < 192) continue;
    const rgb: RGB = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const max = Math.max(...rgb),
      min = Math.min(...rgb);
    if (max < 32 || min > 232 || max - min < 18) continue;
    const saturation = (max - min) / max;
    const weight = 0.4 + saturation * 0.6;
    const key = rgb.map((v) => Math.floor(v / 32)).join(":");
    const bucket = buckets.get(key) ?? { sum: [0, 0, 0], weight: 0 };
    rgb.forEach((v, channel) => {
      bucket.sum[channel] += v * weight;
    });
    bucket.weight += weight;
    buckets.set(key, bucket);
  }
  let best: { sum: number[]; weight: number } | undefined;
  for (const bucket of buckets.values()) {
    if (!best || bucket.weight > best.weight) best = bucket;
  }
  return best
    ? derive([
        best.sum[0] / best.weight,
        best.sum[1] / best.weight,
        best.sum[2] / best.weight,
      ])
    : defaultAtmosphere;
}

// Finished entries are bounded; in-flight work is shared, including StrictMode mounts.
const cache = new Map<string, Promise<AlbumAtmosphere>>();
const settled = new Map<string, AlbumAtmosphere>();
const limit = 128;
export function cachedAtmosphere(source?: string) {
  return source
    ? (settled.get(source) ?? defaultAtmosphere)
    : defaultAtmosphere;
}
export function loadAtmosphere(source: string): Promise<AlbumAtmosphere> {
  const existing = cache.get(source);
  if (existing) return existing;
  const pending = new Promise<AlbumAtmosphere>((resolve) => {
    const img = new Image();
    const finish = (theme: AlbumAtmosphere) => {
      clearTimeout(timer);
      img.onload = img.onerror = null;
      img.removeAttribute("src");
      resolve(theme);
    };
    const timer = setTimeout(() => finish(defaultAtmosphere), 10000);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 48;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return finish(defaultAtmosphere);
        context.drawImage(img, 0, 0, 48, 48);
        finish(atmosphereFromPixels(context.getImageData(0, 0, 48, 48).data));
      } catch {
        // Missing CORS permission or unavailable canvas must never break navigation.
        finish(defaultAtmosphere);
      }
    };
    img.onerror = () => finish(defaultAtmosphere);
    // Tauri's asset protocol is a separate origin too; opt into its CORS headers.
    img.crossOrigin = "anonymous";
    img.src = source;
  }).then((theme) => {
    settled.set(source, theme);
    while (settled.size > limit) {
      const oldest = settled.keys().next().value!;
      settled.delete(oldest);
      cache.delete(oldest);
    }
    return theme;
  });
  cache.set(source, pending);
  return pending;
}
