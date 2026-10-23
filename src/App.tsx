import { Gauge } from 'lucide-react'
import { Link, Navigate, Outlet, Route, Routes, useParams } from 'react-router'
import { useCurrentUser } from './app/context.tsx'
import { useShortcuts } from './app/useShortcuts.ts'
import { LeadId, type UserId } from './contract.ts'
import { LeadDetail, LeadNotFound } from './leads/LeadDetail.tsx'
import { LeadInbox } from './leads/LeadInbox.tsx'
import { LiveIndicator } from './leads/live.tsx'

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Navigate to="/leads" replace />} />
        <Route path="leads" element={<LeadsScreen />} />
        <Route path="leads/:leadId" element={<LeadsScreen />} />
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
        <div className="topbar__end">
          <LiveIndicator />
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
      <LeadInbox selectedId={leadId} />
      {param === undefined ? (
        <section className="detail detail--empty">
          <p className="meta">Select a lead to see its details and follow-ups.</p>
          <p className="meta">Keys: j and k to move, Enter to open, c to log a follow-up.</p>
        </section>
      ) : leadId ? (
        <LeadDetail key={leadId} leadId={leadId} />
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
      <select value={user.id} onChange={(e) => setUserId(e.target.value as UserId)}>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
    </label>
  )
}
