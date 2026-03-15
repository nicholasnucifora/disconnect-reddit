// Deterministic color for a username — same name always gets the same color
const USERNAME_COLORS = [
  "text-sky-400",
  "text-emerald-400",
  "text-violet-400",
  "text-amber-400",
  "text-rose-400",
  "text-cyan-400",
  "text-lime-400",
  "text-fuchsia-400",
  "text-orange-400",
  "text-teal-400",
];

export function usernameColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  }
  return USERNAME_COLORS[hash % USERNAME_COLORS.length];
}
