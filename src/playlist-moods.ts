export const moods = [
  { name: "Happy", detail: "Bright songs to lift the day", icon: "sun", tone: "amber" },
  { name: "Chill", detail: "Slow down and settle in", icon: "waves", tone: "teal" },
  { name: "Dance", detail: "A mix to get you moving", icon: "music", tone: "rose" },
  { name: "Focus", detail: "Keep your mind on the task", icon: "target", tone: "blue" },
  { name: "Energy", detail: "Turn the momentum up", icon: "zap", tone: "orange" },
  { name: "Late night", detail: "For the quieter hours", icon: "moon", tone: "violet" },
  { name: "Melancholy", detail: "Make room for a reflective mood", icon: "cloud", tone: "slate" },
  { name: "Feel good", detail: "Familiar warmth and easy listening", icon: "smile", tone: "green" },
] as const;
export function randomMoods(pool: readonly (typeof moods)[number][] = moods) {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, 4);
}
