// In-memory data persisted to a JSON file (ADR-003). One process, so writes are serialised through
// a promise chain and written atomically (temp file + rename).
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
  Activity,
  IsoDateTime,
  Lead,
  type LeadId,
  type NewActivity,
  type NewLead,
  Notification,
  User,
  type UserId,
} from '../src/contract.ts'
import { firstResponseAt, isContactAttempt } from '../src/domain/speedToLead.ts'
import { newLeadNotification, teammateNotification } from './notifications.ts'

export const Data = z.object({
  users: z.array(User),
  leads: z.array(Lead),
  activities: z.array(Activity),
  // Defaults, so a data file from before notifications still loads.
  notifications: z.array(Notification).default([]),
  /** When each salesperson last opened their notifications (ADR-007). */
  reads: z.record(z.string(), IsoDateTime).default({}),
})
export type Data = z.infer<typeof Data>

export type AppendResult =
  | { kind: 'created'; activity: Activity; lead: Lead }
  | { kind: 'replayed'; activity: Activity; lead: Lead }
  | { kind: 'conflict' }
  | { kind: 'lead_not_found' }

/**
 * Idempotent append (ADR-004). Pure: returns the result and the next data, or the same data when
 * nothing changes.
 */
export function appendActivity(
  data: Data,
  leadId: LeadId,
  input: NewActivity,
  author: User,
  now: IsoDateTime,
): { result: AppendResult; data: Data } {
  const lead = data.leads.find((l) => l.id === leadId)
  if (!lead) return { result: { kind: 'lead_not_found' }, data }

  const existing = data.activities.find((a) => a.id === input.id)
  if (existing) {
    const same =
      existing.leadId === leadId && existing.type === input.type && existing.summary === input.summary
    const result: AppendResult = same
      ? { kind: 'replayed', activity: existing, lead }
      : { kind: 'conflict' }
    return { result, data }
  }

  const activity: Activity = { ...input, leadId, author, occurredAt: now }
  const activities = [...data.activities, activity]
  const updatedLead: Lead = {
    ...lead,
    firstResponseAt: firstResponseAt(activities.filter((a) => a.leadId === leadId)),
    // The first contact attempt on an unclaimed lead claims it for the author (specs A18).
    claim: lead.claim ?? (isContactAttempt(input.type) ? { by: author, at: now } : null),
  }
  // The owner as it was before this activity: a first contact that claims the lead notifies nobody.
  const notification = teammateNotification(lead.claim, updatedLead, activity)
  return {
    result: { kind: 'created', activity, lead: updatedLead },
    data: {
      ...data,
      leads: data.leads.map((l) => (l.id === leadId ? updatedLead : l)),
      activities,
      notifications: notification ? [...data.notifications, notification] : data.notifications,
    },
  }
}

export type ClaimResult =
  | { kind: 'claimed' | 'already_yours'; lead: Lead }
  | { kind: 'conflict' }
  | { kind: 'lead_not_found' }

/**
 * A conditional update (ADR-005): the claim succeeds only while the lead is unclaimed. Run inside
 * the store's write queue, the check and the set are one step, so of two claims exactly one wins.
 */
export function claimLead(data: Data, leadId: LeadId, user: User, now: IsoDateTime) {
  const lead = data.leads.find((l) => l.id === leadId)
  if (!lead) return { result: { kind: 'lead_not_found' } as ClaimResult, data }
  if (lead.claim) {
    const result: ClaimResult =
      lead.claim.by.id === user.id ? { kind: 'already_yours', lead } : { kind: 'conflict' }
    return { result, data }
  }
  const claimed: Lead = { ...lead, claim: { by: user, at: now } }
  return { result: { kind: 'claimed', lead: claimed } as ClaimResult, data: replaceLead(data, claimed) }
}

export type ReleaseResult =
  | { kind: 'released' | 'not_claimed'; lead: Lead }
  | { kind: 'forbidden' }
  | { kind: 'lead_not_found' }

/** Only the owner can release; releasing an unclaimed lead changes nothing. */
export function releaseLead(data: Data, leadId: LeadId, user: User) {
  const lead = data.leads.find((l) => l.id === leadId)
  if (!lead) return { result: { kind: 'lead_not_found' } as ReleaseResult, data }
  if (!lead.claim) return { result: { kind: 'not_claimed', lead } as ReleaseResult, data }
  if (lead.claim.by.id !== user.id) return { result: { kind: 'forbidden' } as ReleaseResult, data }
  const released: Lead = { ...lead, claim: null }
  return { result: { kind: 'released', lead: released } as ReleaseResult, data: replaceLead(data, released) }
}

function replaceLead(data: Data, lead: Lead): Data {
  return { ...data, leads: data.leads.map((l) => (l.id === lead.id ? lead : l)) }
}

export function createLead(data: Data, input: NewLead, id: LeadId, now: IsoDateTime) {
  const lead: Lead = { ...input, id, receivedAt: now, firstResponseAt: null, claim: null }
  return {
    lead,
    data: { ...data, leads: [...data.leads, lead], notifications: [...data.notifications, newLeadNotification(lead)] },
  }
}

export interface Store {
  read(): Data
  findUser(id: UserId): User | undefined
  /** Applies a change and persists it before resolving. */
  update<T>(change: (data: Data) => { data: Data; value: T }): Promise<T>
}

export async function openStore(file: string, seed: () => Data): Promise<Store> {
  let data = await load(file, seed)
  let queue: Promise<void> = Promise.resolve()

  return {
    read: () => data,
    findUser: (id) => data.users.find((u) => u.id === id),
    update(change) {
      const run = queue.then(async () => {
        const next = change(data)
        if (next.data !== data) {
          await save(file, next.data)
          data = next.data
        }
        return next.value
      })
      queue = run.then(
        () => undefined,
        () => undefined, // the caller gets the rejection from `run`; the queue keeps going
      )
      return run
    },
  }
}

async function load(file: string, seed: () => Data): Promise<Data> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const seeded = seed()
    await save(file, seeded)
    return seeded
  }
  // A corrupt file is a startup error, not something to paper over with seed data.
  return Data.parse(JSON.parse(raw))
}

async function save(file: string, data: Data): Promise<void> {
  await mkdir(dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  await writeFile(temp, JSON.stringify(data, null, 2))
  await rename(temp, file)
}
