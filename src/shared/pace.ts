/** Formats seconds-per-km as `m:ss/km`. */
export function formatPace(secPerKm: number): string {
  const total = Math.round(secPerKm);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}/km`;
}

/** Parses `m:ss` (or plain seconds) into seconds per km. */
export function parsePace(input: string): number {
  const trimmed = input.trim();
  if (trimmed.includes(':')) {
    const [m, s] = trimmed.split(':');
    return Number(m) * 60 + Number(s ?? 0);
  }
  return Number(trimmed);
}
