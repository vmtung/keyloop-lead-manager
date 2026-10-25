import { describeFailure } from '../api/describeFailure.ts'
import type { TeamMemberStats } from '../contract.ts'
import { formatDuration } from '../domain/format.ts'
import { SLA } from '../domain/speedToLead.ts'
import { Avatar } from '../leads/Avatar.tsx'
import { useTeamStats } from '../leads/queries.ts'

const TARGET = formatDuration(SLA.targetMs)

/**
 * Speed to lead per salesperson (AC-10.1): a manager's view of the inbox figures. Credit goes to
 * whoever made the first contact (A20). Rows are reserved while loading so nothing moves (AC-10.3).
 */
export function TeamView() {
  const team = useTeamStats()
  return (
    <main className="team">
      <h1 className="team__title">Team</h1>
      <p className="meta">First responses in the last 24 hours, credited to whoever made first contact.</p>
      {team.isError ? (
        <div className="block-error" role="alert">
          <p>Couldn’t load the team’s figures. {describeFailure(team.error)}</p>
          <button type="button" className="button button--text" onClick={() => void team.refetch()}>
            Retry
          </button>
        </div>
      ) : (
        // Scrolls sideways on its own on a narrow phone, so the page itself never does.
        <div className="team__scroll" role="region" aria-label="Team figures" tabIndex={0}>
        <table className="team__table" aria-busy={team.data ? undefined : true}>
          <thead>
            <tr>
              <th scope="col">Salesperson</th>
              <th scope="col" className="team__num">Answered</th>
              <th scope="col" className="team__num">In {TARGET}</th>
              <th scope="col" className="team__num">Median first reply</th>
              <th scope="col" className="team__num">Waiting, claimed</th>
            </tr>
          </thead>
          <tbody>
            {team.data
              ? team.data.map((p) => <MemberRow key={p.user.id} member={p} />)
              : Array.from({ length: 3 }, (_, i) => (
                  <tr key={i} aria-hidden>
                    {Array.from({ length: 5 }, (_, j) => (
                      <td key={j}><span className="bar team__bar" /></td>
                    ))}
                  </tr>
                ))}
          </tbody>
        </table>
        </div>
      )}
    </main>
  )
}

function MemberRow({ member: p }: { member: TeamMemberStats }) {
  return (
    <tr>
      <th scope="row">
        <span className="team__person"><Avatar user={p.user} size="medium" /> {p.user.name}</span>
      </th>
      <td className="team__num num">{p.answered}</td>
      <td className="team__num num">
        {p.withinTargetShare === null ? <Dash /> : `${Math.round(p.withinTargetShare * 100)}%`}
      </td>
      <td className="team__num num">
        {p.medianResponseMs === null ? <Dash /> : formatDuration(p.medianResponseMs)}
      </td>
      <td className="team__num num">
        {p.claimedWaiting}
        {p.claimedOverdue > 0 && <span className="team__overdue"> · {p.claimedOverdue} overdue</span>}
      </td>
    </tr>
  )
}

const Dash = () => <span className="figure__none" aria-label="None">—</span>
