import { Gauge } from 'lucide-react'
import { Link, Navigate, NavLink, Outlet, Route, Routes, useParams } from 'react-router'
import { useCurrentUser } from './app/context.tsx'
import { ErrorBoundary } from './app/ErrorBoundary.tsx'
import { useShortcuts } from './app/useShortcuts.ts'
import { LeadId, type UserId } from './contract.ts'
import { LeadDetail, LeadNotFound } from './leads/LeadDetail.tsx'
import { LeadInbox } from './leads/LeadInbox.tsx'
import { NextUp } from './leads/NextUp.tsx'
import { Avatar } from './leads/Avatar.tsx'
import { LiveIndicator } from './leads/live.tsx'
import { NotificationBell } from './notifications/NotificationBell.tsx'
import { TeamView } from './team/TeamView.tsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/leads" replace />} />
        <Route path="leads" element={<LeadsScreen />} />
        <Route path="leads/:leadId" element={<LeadsScreen />} />
        <Route path="team" element={<TeamView />} />
        <Route path="*" element={<Navigate to="/leads" replace />} />
      </Route>
    </Routes>
  )
}

function Shell() {
  useShortcuts()
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/leads" className="brand">
          <Gauge aria-hidden size={18} />
          <span className="brand__name">Lead Manager</span>
          <span className="brand__scope">Kingsway Motors, Leeds</span>
        </Link>
        <nav className="nav" aria-label="Main">
          <NavLink to="/leads" className="nav__link">Leads</NavLink>
          <NavLink to="/team" className="nav__link">Team</NavLink>
        </nav>
        <div className="topbar__end">
          <LiveIndicator />
          <NotificationBell />
          <UserSwitcher />
        </div>
      </header>
      <Outlet />
    </div>
  )
}

function LeadsScreen() {
  const param = useParams().leadId
  const parsed = param === undefined ? undefined : LeadId.safeParse(param)
  const leadId = parsed?.success ? parsed.data : undefined

  return (
    <main className="workspace" data-view={param === undefined ? 'list' : 'detail'}>
      {leadId && (
        // The inbox can be hundreds of rows long; keyboard users can jump past it.
        <a href="#lead-detail" className="skip-link">
          Skip to lead details
        </a>
      )}
      <LeadInbox selectedId={leadId} />
      {param === undefined ? (
        <NextUp />
      ) : leadId ? (
        <ErrorBoundary key={leadId} scope="pane">
          <LeadDetail leadId={leadId} />
        </ErrorBoundary>
      ) : (
        <LeadNotFound />
      )}
    </main>
  )
}

function UserSwitcher() {
  const { user, users, setUserId } = useCurrentUser()
  if (!user) return null
  return (
    <label className="user-switcher">
      <span className="meta">Signed in as</span>
      <Avatar user={user} size="medium" />
      <select value={user.id} onChange={(e) => setUserId(e.target.value as UserId)}>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
    </label>
  )
}
