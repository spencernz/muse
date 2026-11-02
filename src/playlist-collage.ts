export function chooseCovers(pool: readonly string[], random = Math.random): string[] {
  const candidates = [...new Set(pool.filter(Boolean))].slice(0, 50);
  for (let i=candidates.length-1;i>0;i--) { const j=Math.floor(random()*(i+1)); [candidates[i],candidates[j]]=[candidates[j],candidates[i]]; }
  return candidates.slice(0,5);
}
export function rotateCover(shown: readonly string[], pool: readonly string[], random = Math.random): string[] {
  const available=[...new Set(pool)].filter(path=>path && !shown.includes(path));
  if (!shown.length || !available.length) return [...shown];
  const next=[...shown]; next[Math.floor(random()*next.length)]=available[Math.floor(random()*available.length)]; return next;
}
