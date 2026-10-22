const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Elapsed time at the precision a salesperson cares about: "7 min", "1 h 12 min", "2 d 3 h". */
export function formatDuration(ms: number): string {
  if (ms < MINUTE) return 'under 1 min'
  if (ms < HOUR) return `${Math.floor(ms / MINUTE)} min`
  if (ms < DAY) {
    const h = Math.floor(ms / HOUR)
    const min = Math.floor((ms % HOUR) / MINUTE)
    return min === 0 ? `${h} h` : `${h} h ${min} min`
  }
  const d = Math.floor(ms / DAY)
  const h = Math.floor((ms % DAY) / HOUR)
  return h === 0 ? `${d} d` : `${d} d ${h} h`
}
