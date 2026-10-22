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

const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
})

/** Vehicle prices are whole pounds in practice: 3149500 → "£31,495". */
export function formatPrice(pence: number): string {
  return gbp.format(Math.round(pence / 100))
}

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

/** "Today 09:15", "Yesterday 17:40", "20 Oct 11:02", in the viewer's time zone. */
export function formatWhen(iso: string, now: number): string {
  const date = new Date(iso)
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const diffDays = Math.floor((startOfToday.getTime() - startOfDay(date)) / DAY)
  const day = diffDays <= 0 ? 'Today' : diffDays === 1 ? 'Yesterday' : dayMonth.format(date)
  return `${day} ${time.format(date)}`
}

function startOfDay(date: Date): number {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}
