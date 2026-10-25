// Keyset paging for contacted leads (ADR-006). The cursor names the last lead returned, by the same
// key the list is sorted on, so a lead added mid-scroll can't shift the pages.
import { z } from 'zod'
import type { IsoDateTime, Lead, LeadId } from '../src/contract.ts'
import { newestFirst } from '../src/domain/speedToLead.ts'

const CursorKey = z.tuple([z.iso.datetime(), z.uuid()])
type Key = Pick<Lead, 'receivedAt' | 'id'>

export function encodeCursor(lead: Key): string {
  return Buffer.from(JSON.stringify([lead.receivedAt, lead.id])).toString('base64url')
}

/** The key a cursor names, or null if it isn't one this server made. */
export function decodeCursor(cursor: string): Key | null {
  try {
    const parsed = CursorKey.safeParse(JSON.parse(Buffer.from(cursor, 'base64url').toString()))
    return parsed.success ? { receivedAt: parsed.data[0] as IsoDateTime, id: parsed.data[1] as LeadId } : null
  } catch {
    return null // not base64 JSON: the caller answers 400
  }
}

export function pageContacted(leads: readonly Lead[], after: Key | null, limit: number) {
  const contacted = leads.filter((l) => l.firstResponseAt !== null).sort(newestFirst)
  const start = after ? contacted.findIndex((l) => newestFirst(l, after) > 0) : 0
  const page = start === -1 ? [] : contacted.slice(start, start + limit)
  const last = page.at(-1)
  const more = start !== -1 && start + limit < contacted.length
  return { leads: page, nextCursor: more && last ? encodeCursor(last) : null, total: contacted.length }
}
