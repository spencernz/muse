export interface LyricLine { time: number; text: string }
export function parseLrc(text: string): LyricLine[] {
  const offset = Number(text.match(/\[offset:([+-]?\d+)\]/i)?.[1] ?? 0) / 1000;
  return text.split(/\r?\n/).flatMap(line => {
    const times = [...line.matchAll(/\[(\d+):([0-5]?\d(?:\.\d{1,3})?)\]/g)];
    const words = line.replace(/\[[^\]]*\]/g, "").trim();
    return times.map(match => ({ time: Math.max(0, Number(match[1]) * 60 + Number(match[2]) + offset), text: words }));
  }).filter(line => Number.isFinite(line.time)).sort((a,b) => a.time-b.time);
}
