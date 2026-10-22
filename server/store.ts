// In-memory data persisted to a JSON file (ADR-003). One process, so writes are serialised through
// a promise chain and written atomically (temp file + rename).
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'
import {
  Activity,
  type IsoDateTime,
  Lead,
  type LeadId,
  type NewActivity,
  type NewLead,
  User,
  type UserId,
} from '../src/contract.ts'
import { firstResponseAt } from '../src/domain/speedToLead.ts'

export const Data = z.object({
  users: z.array(User),
  leads: z.array(Lead),
  activities: z.array(Activity),
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
  }
  return {
    result: { kind: 'created', activity, lead: updatedLead },
    data: {
      ...data,
      leads: data.leads.map((l) => (l.id === leadId ? updatedLead : l)),
      activities,
    },
  }
}

export function createLead(data: Data, input: NewLead, id: LeadId, now: IsoDateTime) {
  const lead: Lead = { ...input, id, receivedAt: now, firstResponseAt: null }
  return { lead, data: { ...data, leads: [...data.leads, lead] } }
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
