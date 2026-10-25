// Live changes patch the inbox in place instead of refetching every loaded page (ADR-006, AC-5.4).
// The lead itself always comes from the REST API; these only decide where it goes.
import type { InfiniteData } from '@tanstack/react-query'
import type { Lead, LeadPageResponse } from '../contract.ts'
import { newestFirst } from '../domain/speedToLead.ts'

export type ContactedPages = InfiniteData<LeadPageResponse, string | null>

/** The awaiting list with `lead` in place: kept, longest-waiting first, only while it is waiting. */
export function placeInAwaiting(leads: readonly Lead[], lead: Lead): Lead[] {
  const rest = leads.filter((l) => l.id !== lead.id)
  if (lead.firstResponseAt !== null) return rest
  return [...rest, lead].sort((a, b) => newestFirst(b, a))
}

/**
 * The loaded contacted pages with `lead` in its sorted place. A lead that sorts below them, with
 * more pages to come, is left out: it arrives with its page. `joined` says the lead has just been
 * contacted, so the total grows by one.
 */
export function placeInContacted(data: ContactedPages, lead: Lead, joined: boolean): ContactedPages {
  // Pages are contiguous, so each covers the leads up to its last one, as loaded.
  const at = data.pages.findIndex((p) => {
    const last = p.leads.at(-1)
    return last !== undefined && newestFirst(lead, last) <= 0
  })
  const total = (data.pages[0]?.total ?? 0) + (joined ? 1 : 0)
  const pages = data.pages.map((p) => ({ ...p, total, leads: p.leads.filter((l) => l.id !== lead.id) }))
  if (lead.firstResponseAt !== null) {
    const target = at !== -1 ? pages[at] : pages.at(-1)?.nextCursor === null ? pages.at(-1) : undefined
    if (target) target.leads = [...target.leads, lead].sort(newestFirst)
  }
  return { ...data, pages }
}
