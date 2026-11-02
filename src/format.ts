export function duration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
export function totalTime(seconds: number) {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
    : `${minutes} min`;
}

// Only split recognizable release suffixes; parentheses may belong to a title.
export function albumDisplayTitle(title: string) {
  const match = title.match(
    /^(.*?)\s*[[(]([^\])]*(?:edition|anniversary|remaster|deluxe|expanded|bonus)[^\])]*)[\])]\s*((?:CD|disc)\s*\d+)?$/i,
  );
  if (match?.[1].trim())
    return {
      title: match[1].trim(),
      edition: [match[2].trim(), match[3]?.trim()].filter(Boolean).join(" · "),
    };
  const disc = title.match(/^(.*?)\s+(?:[-–—·]\s*)?((?:CD|disc)\s*\d+)$/i);
  return disc?.[1].trim()
    ? { title: disc[1].trim(), edition: disc[2].trim() }
    : { title, edition: "" };
}
