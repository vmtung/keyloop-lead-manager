import { Bell } from 'lucide-react'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { describeFailure } from '../api/describeFailure.ts'
import { useNow } from '../app/context.tsx'
import type { ActivityType, Notification } from '../contract.ts'
import { formatWhen } from '../domain/format.ts'
import { ENQUIRY_LABEL } from '../domain/labels.ts'
import { isSoundOn, setSoundOn } from './chime.ts'
import { useMarkRead, useNotifications, useUnreadCount } from './queries.ts'

/**
 * The top bar's notifications (AC-11.1, AC-11.2). The count loads with the page; the list loads only
 * when opened, and opening marks everything read.
 */
export function NotificationBell() {
  const unread = useUnreadCount()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const count = unread.data ?? 0

  function close() {
    setOpen(false)
    button.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) close()
  }

  return (
    <div className="bell" ref={root} onKeyDown={onKeyDown}>
      <button ref={button} type="button" className="bell__button" aria-expanded={open} aria-controls="notifications"
        aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'} onClick={() => (open ? close() : setOpen(true))}>
        <Bell aria-hidden size={18} />
        {count > 0 && <span className="bell__count num" aria-hidden>{count > 99 ? '99+' : count}</span>}
      </button>
      {open && <NotificationPanel onNavigate={() => setOpen(false)} />}
    </div>
  )
}

function NotificationPanel({ onNavigate }: { onNavigate: () => void }) {
  const list = useNotifications()
  const markRead = useMarkRead()
  const now = useNow()
  const panel = useRef<HTMLDivElement>(null)
  const [sound, setSound] = useState(isSoundOn)
  const marked = useRef(false)
  // What was unread when the list opened stays marked while it's open, though it is now read.
  const lastReadAt = list.data?.pages[0]?.lastReadAt ?? null
  const loaded = list.isSuccess

  useEffect(() => panel.current?.focus(), [])

  useEffect(() => {
    if (!loaded || marked.current) return
    marked.current = true
    markRead.mutate()
  }, [loaded, markRead])

  const items = list.data?.pages.flatMap((p) => p.notifications) ?? []

  return (
    <div ref={panel} id="notifications" className="bell__panel" role="dialog" aria-labelledby="notifications-title" tabIndex={-1}>
      <div className="bell__header">
        <h2 id="notifications-title" className="bell__title">Notifications</h2>
        <label className="bell__sound">
          <input type="checkbox" role="switch" checked={sound}
            onChange={(e) => {
              setSoundOn(e.target.checked)
              setSound(e.target.checked)
            }} />
          Sound for new leads
        </label>
      </div>

      {list.isError ? (
        <div className="block-error" role="alert">
          <p>Couldn’t load notifications. {describeFailure(list.error)}</p>
          <button type="button" className="button button--text" onClick={() => void list.refetch()}>Retry</button>
        </div>
      ) : !list.data ? (
        <div aria-busy="true" aria-label="Loading notifications">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="note note--skeleton" aria-hidden>
              <span className="bar" style={{ width: '70%' }} />
              <span className="bar" style={{ width: '30%' }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="empty empty--inline">Nothing yet.</p>
      ) : (
        <ul className="bell__list">
          {items.map((n) => {
            const unread = lastReadAt === null || Date.parse(n.at) > Date.parse(lastReadAt)
            return (
              <li key={n.id}>
                <Link to={`/leads/${n.leadId}`} className={`note${unread ? ' note--unread' : ''}`} onClick={onNavigate}>
                  <span className="note__text">
                    {unread && <span className="visually-hidden">Unread: </span>}
                    <NotificationText n={n} />
                  </span>
                  <span className="meta num">{formatWhen(n.at, now)}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {list.hasNextPage && (
        <div className="load-more">
          {list.isFetchNextPageError && <p className="load-more__error" role="alert">Couldn’t load more.</p>}
          <button type="button" className="button button--secondary load-more__button" aria-disabled={list.isFetchingNextPage}
            onClick={() => list.isFetchingNextPage || void list.fetchNextPage()}>
            {list.isFetchingNextPage ? 'Loading more…' : list.isFetchNextPageError ? 'Retry' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}

const DID: Record<ActivityType, string> = {
  call: 'called',
  email: 'emailed',
  sms: 'texted',
  appointment: 'booked an appointment with',
  note: 'added a note on',
}

function NotificationText({ n }: { n: Notification }) {
  switch (n.kind) {
    case 'new_lead':
      return <>New lead: <strong>{n.customerName}</strong>, {ENQUIRY_LABEL[n.enquiryType].toLowerCase()}</>
    case 'teammate_activity':
      return <><strong>{n.actor.name}</strong> {DID[n.activityType]} <strong>{n.customerName}</strong>, your lead</>
    default:
      return n satisfies never
  }
}
