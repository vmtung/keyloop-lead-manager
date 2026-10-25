// Keyset paging (ADR-006): the cursor names the last item returned by the key the list is sorted on
// (a time and an ID, newest first), so an item added mid-scroll can't shift the pages.
import { z } from 'zod'
import type { Lead } from '../src/contract.ts'
import { newestFirst } from '../src/domain/speedToLead.ts'

const CursorKey = z.tuple([z.iso.datetime(), z.string().min(1).max(100)])
export interface Key {
  at: string
  id: string
}

export function encodeCursor(key: Key): string {
  return Buffer.from(JSON.stringify([key.at, key.id])).toString('base64url')
}

/** The key a cursor names, or null if it isn't one this server made. */
export function decodeCursor(cursor: string): Key | null {
  try {
    const parsed = CursorKey.safeParse(JSON.parse(Buffer.from(cursor, 'base64url').toString()))
    return parsed.success ? { at: parsed.data[0], id: parsed.data[1] } : null
  } catch {
    return null // not base64 JSON: the caller answers 400
  }
}

/** One page of `sorted` (newest first by `key`), after the item `after` names. */
export function page<T>(sorted: readonly T[], key: (item: T) => Key, after: Key | null, limit: number) {
  const newer = (a: Key, b: Key) => Date.parse(b.at) - Date.parse(a.at) || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0)
  const start = after ? sorted.findIndex((item) => newer(key(item), after) > 0) : 0
  const items = start === -1 ? [] : sorted.slice(start, start + limit)
  const last = items.at(-1)
  const more = start !== -1 && start + limit < sorted.length
  return { items, nextCursor: more && last ? encodeCursor(key(last)) : null }
}

export function pageContacted(leads: readonly Lead[], after: Key | null, limit: number) {
  const contacted = leads.filter((l) => l.firstResponseAt !== null).sort(newestFirst)
  const { items, nextCursor } = page(contacted, (l) => ({ at: l.receivedAt, id: l.id }), after, limit)
  return { leads: items, nextCursor, total: contacted.length }
}

