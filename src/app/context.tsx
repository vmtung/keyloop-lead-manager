// App-wide context: the API client, the ticking clock, the screen-reader announcer, the signed-in user.
import { useQuery } from '@tanstack/react-query'
import { createContext, type ReactNode, use, useCallback, useEffect, useMemo, useState } from 'react'
import type { Api } from '../api/client.ts'
import type { User, UserId } from '../contract.ts'
import { log } from '../observability/log.ts'

function required<T>(value: T | null, name: string): T {
  if (value === null) throw new Error(`${name} is missing its provider`)
  return value
}

// API ------------------------------------------------------------------------------------------

const ApiContext = createContext<Api | null>(null)

export function ApiProvider({ api, children }: { api: Api; children: ReactNode }) {
  return <ApiContext value={api}>{children}</ApiContext>
}

export const useApi = () => required(use(ApiContext), 'useApi')

// Clock: one shared tick so every timer on screen agrees (AC-2.3) --------------------------------

const NowContext = createContext<number | null>(null)

export function NowProvider({ intervalMs = 15_000, children }: { intervalMs?: number; children: ReactNode }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return <NowContext value={now}>{children}</NowContext>
}

export const useNow = () => required(use(NowContext), 'useNow')

// Announcer: one polite live region for status changes (AC-6.4) -----------------------------------

const AnnounceContext = createContext<((message: string) => void) | null>(null)

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState({ text: '', id: 0 })
  const announce = useCallback((text: string) => setMessage((m) => ({ text, id: m.id + 1 })), [])
  return (
    <AnnounceContext value={announce}>
      {children}
      <div role="status" aria-live="polite" className="visually-hidden">
        {/* A new key re-announces a message even when the text repeats. */}
        <span key={message.id}>{message.text}</span>
      </div>
    </AnnounceContext>
  )
}

export const useAnnounce = () => required(use(AnnounceContext), 'useAnnounce')

// Signed-in user: a stand-in for auth (specs A2) -------------------------------------------------

const USER_KEY = 'lead-manager.user'

interface CurrentUser {
  user: User | undefined
  users: User[]
  setUserId: (id: UserId) => void
  status: 'pending' | 'error' | 'success'
}

const CurrentUserContext = createContext<CurrentUser | null>(null)

export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const api = useApi()
  const users = useQuery({ queryKey: ['users'], queryFn: ({ signal }) => api.listUsers(signal) })
  const [userId, setStoredId] = useState<string | null>(readStoredUserId)

  const value = useMemo<CurrentUser>(() => {
    const list = users.data?.users ?? []
    return {
      user: list.find((u) => u.id === userId) ?? list[0],
      users: list,
      status: users.status,
      setUserId: (id) => {
        setStoredId(id)
        writeStoredUserId(id)
      },
    }
  }, [users.data, users.status, userId])

  const currentId = value.user?.id
  useEffect(() => {
    if (currentId) log.setContext({ userId: currentId })
  }, [currentId])

  return <CurrentUserContext value={value}>{children}</CurrentUserContext>
}

export const useCurrentUser = () => required(use(CurrentUserContext), 'useCurrentUser')

// Storage can be unavailable (private mode, blocked site data). The choice is a convenience, so
// without storage the app falls back to the first user for this visit.
function readStoredUserId(): string | null {
  try {
    return localStorage.getItem(USER_KEY)
  } catch (error) {
    log.warn('storage.read_failed', { key: USER_KEY, message: String(error) })
    return null
  }
}

function writeStoredUserId(id: string) {
  try {
    localStorage.setItem(USER_KEY, id)
  } catch (error) {
    // Same fallback as reading: the choice lasts until reload.
    log.warn('storage.write_failed', { key: USER_KEY, message: String(error) })
  }
}
