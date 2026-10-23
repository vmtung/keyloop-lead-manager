import type { Lead } from '../contract.ts'
import { formatDuration } from '../domain/format.ts'
import { inboxStats } from '../domain/inbox.ts'
import { SLA } from '../domain/speedToLead.ts'

const TARGET = formatDuration(SLA.targetMs)

/**
 * The screen's headline (AC-1.6): who is waiting, and how fast the team has answered over the last
 * day. Rendered while loading too, with bars in place of values, so nothing moves when data lands.
 */
export function InboxFigures({ leads, now }: { leads: Lead[] | undefined; now: number }) {
  const stats = leads && inboxStats(leads, now)
  return (
    <dl className="figures" aria-busy={stats ? undefined : true}>
      <div className="figure">
        <dt>Waiting</dt>
        <dd className="figure__value num">{stats ? stats.waiting : <Pending />}</dd>
        <dd className={`figure__sub${stats && stats.overdue > 0 ? ' figure__sub--negative' : ''}`}>
          {stats && (stats.overdue > 0 ? `${stats.overdue} overdue` : 'none overdue')}
        </dd>
      </div>
      <div className="figure">
        <dt>In {TARGET}</dt>
        <dd className="figure__value num">
          {stats ? (stats.withinTargetShare === null ? <Dash /> : `${Math.round(stats.withinTargetShare * 100)}%`) : <Pending />}
        </dd>
        <dd className="figure__sub">{stats && `of ${stats.answered}, last 24 h`}</dd>
      </div>
      <div className="figure">
        <dt>Median</dt>
        <dd className="figure__value num">
          {stats ? stats.medianResponseMs === null ? <Dash /> : <Duration ms={stats.medianResponseMs} /> : <Pending />}
        </dd>
        <dd className="figure__sub">{stats && 'first reply, 24 h'}</dd>
      </div>
    </dl>
  )
}

/** "1 h 12 min" with the numbers large and the units small, as figures are set. */
export function Duration({ ms }: { ms: number }) {
  return (
    <>
      {formatDuration(ms)
        .split(' ')
        .map((part, i) =>
          /^\d+$/.test(part) ? <span key={i}>{part}</span> : <span key={i} className="unit"> {part} </span>,
        )}
    </>
  )
}

const Dash = () => <span className="figure__none" aria-label="None yet">—</span>
const Pending = () => <span className="bar figure__bar" />
