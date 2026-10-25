import { describe, expect, test } from 'vitest'
import type { IsoDateTime, Lead, LeadId, LeadPageResponse } from '../contract.ts'
import { type ContactedPages, placeInAwaiting, placeInContacted } from './placeLead.ts'

const MIN = 60_000
const NOW = Date.parse('2026-10-25T12:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString() as IsoDateTime

/** Received `ago` minutes before NOW; contacted unless `waiting`. */
function lead(ago: number, waiting = false): Lead {
  return {
    id: `00000000-0000-4000-8000-${String(ago).padStart(12, '0')}` as LeadId,
    customer: { name: `Lead ${ago}`, email: 'x@example.com', phone: '07700 900000' },
    enquiryType: 'vehicle_enquiry',
    message: '',
    vehicle: null,
    receivedAt: iso(NOW - ago * MIN),
    firstResponseAt: waiting ? null : iso(NOW - ago * MIN + MIN),
    claim: null,
  }
}

const page = (leads: Lead[], nextCursor: string | null, total: number): LeadPageResponse => ({ leads, nextCursor, total })
const pages = (...p: LeadPageResponse[]): ContactedPages => ({ pages: p, pageParams: p.map((_, i) => (i === 0 ? null : `c${i}`)) })
const names = (data: ContactedPages) => data.pages.map((p) => p.leads.map((l) => l.customer.name))

describe('AC-5.4: placing a changed lead without refetching pages', () => {
  test('a lead that has just been contacted leaves the awaiting list', () => {
    expect(placeInAwaiting([lead(10, true), lead(5, true)], lead(10)).map((l) => l.customer.name)).toEqual(['Lead 5'])
  })

  test('a waiting lead is updated in place, longest-waiting first', () => {
    const claimed = { ...lead(5, true), claim: { by: { id: 'tom', name: 'Tom Hughes' }, at: iso(NOW) } } as Lead
    const result = placeInAwaiting([lead(10, true), lead(5, true), lead(1, true)], claimed)
    expect(result.map((l) => l.customer.name)).toEqual(['Lead 10', 'Lead 5', 'Lead 1'])
    expect(result[1]).toBe(claimed)
  })

  test('a newly contacted lead goes into its sorted place in the loaded pages, and the total grows', () => {
    const data = pages(page([lead(10), lead(20)], 'c1', 4), page([lead(30), lead(40)], null, 4))
    const result = placeInContacted(data, lead(25), true)
    expect(names(result)).toEqual([['Lead 10', 'Lead 20'], ['Lead 25', 'Lead 30', 'Lead 40']])
    expect(result.pages.map((p) => p.total)).toEqual([5, 5])
    expect(result.pageParams).toBe(data.pageParams)
  })

  test('a lead that sorts below the loaded pages is left for its page to bring', () => {
    const data = pages(page([lead(10), lead(20)], 'c1', 9))
    const result = placeInContacted(data, lead(90), true)
    expect(names(result)).toEqual([['Lead 10', 'Lead 20']])
    expect(result.pages[0]!.total).toBe(10)
  })

  test('below the loaded pages but on the last page: appended', () => {
    const data = pages(page([lead(10), lead(20)], null, 2))
    expect(names(placeInContacted(data, lead(90), true))).toEqual([['Lead 10', 'Lead 20', 'Lead 90']])
  })

  test('a contacted lead that changed (a claim) is replaced where it is, the total unchanged', () => {
    const changed = { ...lead(20), claim: { by: { id: 'tom', name: 'Tom Hughes' }, at: iso(NOW) } } as Lead
    const data = pages(page([lead(10), lead(20)], 'c1', 4), page([lead(30)], null, 4))
    const result = placeInContacted(data, changed, false)
    expect(names(result)).toEqual([['Lead 10', 'Lead 20'], ['Lead 30']])
    expect(result.pages[0]!.leads[1]).toBe(changed)
    expect(result.pages[0]!.total).toBe(4)
  })

  test('a waiting lead is not placed among the contacted', () => {
    const data = pages(page([lead(10)], null, 1))
    expect(names(placeInContacted(data, lead(5, true), false))).toEqual([['Lead 10']])
  })
})
