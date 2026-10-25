// A dealership's month of history, seeded by default (specs A16): 5,000 contacted leads over the last
// 30 days, each with a first contact and often a few follow-ups, beside the sample leads. Seeded
// random, so every reset makes the same data.
import type { Activity, ActivityId, ActivityType, EnquiryType, IsoDateTime, Lead, LeadId } from '../src/contract.ts'
import { seed, USERS } from './seed.ts'
import { withNotifications } from './notifications.ts'
import type { Data } from './store.ts'

const COUNT = 5000
const MIN = 60_000
const DAY_MS = 24 * 60 * MIN

const FIRST = ['Amelia', 'Oliver', 'Isla', 'Jack', 'Ava', 'Noah', 'Mia', 'Leo', 'Freya', 'Arthur', 'Grace', 'Oscar', 'Zara', 'Harry', 'Priya', 'Kwame', 'Sofia', 'Ewan', 'Leila', 'Mateo', 'Hannah', 'Callum', 'Nadia', 'Rhys']
const LAST = ['Smith', 'Jones', 'Taylor', 'Brown', 'Wilson', 'Evans', 'Khan', 'Singh', 'Walsh', 'Hughes', 'Clarke', 'Mensah', 'Novak', 'Rossi', 'Begum', 'Price', 'Fraser', 'Doyle', 'Shah', 'Lewis', 'Okafor', 'Murray']
const VEHICLES = [
  { make: 'Ford', model: 'Puma', variant: '1.0 EcoBoost ST-Line', pricePence: 1899000 },
  { make: 'Kia', model: 'Sportage', variant: '1.6 T-GDi HEV GT-Line', pricePence: 3149500 },
  { make: 'Volkswagen', model: 'Golf', variant: '1.5 eTSI Life', pricePence: 2449500 },
  { make: 'Toyota', model: 'Yaris', variant: '1.5 Hybrid Icon', pricePence: 1649500 },
  { make: 'Hyundai', model: 'Tucson', variant: '1.6 T-GDi Premium', pricePence: 2795000 },
  { make: 'Nissan', model: 'Qashqai', variant: '1.3 DIG-T MHEV N-Connecta', pricePence: 2399000 },
  { make: 'Skoda', model: 'Octavia', variant: '2.0 TDI SE L Estate', pricePence: 2149500 },
  { make: 'Kia', model: 'EV6', variant: '77.4kWh GT-Line', pricePence: 3799500 },
]
const MESSAGES: Record<EnquiryType, string[]> = {
  vehicle_enquiry: ['Is this still available?', 'Does it have a full service history?', 'How many owners has it had?', 'Is the warranty transferable?'],
  test_drive: ['Can I test drive it this weekend?', 'Could I come in after work on Thursday?', 'Is an evening test drive possible?'],
  finance: ['What would PCP over 48 months look like?', 'Can I get finance with a low deposit?', 'What APR could I expect on this?'],
  part_exchange: ['Would you take my current car in part exchange?', 'What could you offer for my 2018 Focus?', 'I have a 2019 Polo to trade in.'],
}
const ENQUIRIES = Object.keys(MESSAGES) as EnquiryType[]
const FIRST_CONTACTS: { type: ActivityType; summary: string }[] = [
  { type: 'call', summary: 'Called, answered the questions in the enquiry.' },
  { type: 'call', summary: 'Called, no answer. Left a voicemail.' },
  { type: 'email', summary: 'Emailed the details and offered a time to visit.' },
  { type: 'sms', summary: 'Texted to arrange a call back.' },
]
const FOLLOW_UPS: { type: ActivityType; summary: string }[] = [
  { type: 'note', summary: 'Customer is comparing with another dealer.' },
  { type: 'call', summary: 'Called back, talked through the options.' },
  { type: 'email', summary: 'Sent a quote and the brochure.' },
  { type: 'sms', summary: 'Texted a reminder about the offer.' },
  { type: 'appointment', summary: 'Booked a visit to the showroom.' },
]

/** The sample data plus a month of history: what the mock API starts with and resets to. */
export function seedWithHistory(now: Date = new Date()): Data {
  return withHistory(seed(now), now)
}

/** `base` plus COUNT older contacted leads. IDs start well clear of the sample's. */
export function withHistory(base: Data, now: Date): Data {
  const random = mulberry32(2026)
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
  const at = (ms: number) => new Date(ms).toISOString() as IsoDateTime
  const plate = () =>
    `${pick(['LS', 'YH', 'MA', 'WP', 'BD', 'SN', 'KM', 'DY'])}${pick(['22', '23', '24', '72', '73'])} ${Array.from({ length: 3 }, () => pick([...'ABCDEFGHJKLMNPRSTUVWXYZ'])).join('')}`
  const leads: Lead[] = []
  const activities: Activity[] = []

  for (let i = 0; i < COUNT; i++) {
    const id = uuidFrom(0x100000 + i) as LeadId
    const name = `${pick(FIRST)} ${pick(LAST)}`
    const enquiryType = pick(ENQUIRIES)
    // At least three hours old, so even the slowest first contact (two hours) is in the past.
    const received = now.getTime() - DAY_MS * 30 * random() - 3 * 60 * MIN
    // Mostly quick, with a long tail, as a real team's response times look.
    const firstAt = received + Math.round(MIN * (1 + 120 * random() ** 3))
    const author = pick(USERS)
    const own: Activity[] = []
    const add = (step: { type: ActivityType; summary: string }, by: typeof author, ms: number) =>
      own.push({
        id: uuidFrom(0x1000000 + i * 8 + own.length) as ActivityId,
        leadId: id,
        type: step.type,
        summary: step.summary,
        author: by,
        occurredAt: at(ms),
      })
    add(pick(FIRST_CONTACTS), author, firstAt)
    // Up to three follow-ups hours or days apart, mostly by the same person, never in the future.
    let next = firstAt
    for (let f = Math.floor(random() * 4); f > 0; f--) {
      next += Math.round(MIN * (30 + 60 * 48 * random()))
      if (next >= now.getTime()) break
      add(pick(FOLLOW_UPS), random() < 0.85 ? author : pick(USERS), next)
    }
    activities.push(...own)
    leads.push({
      id,
      customer: {
        name,
        email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
        phone: `07700 900${String(i % 1000).padStart(3, '0')}`,
      },
      enquiryType,
      message: pick(MESSAGES[enquiryType]),
      vehicle: random() < 0.85 ? { ...pick(VEHICLES), registration: plate() } : null,
      receivedAt: at(received),
      firstResponseAt: at(firstAt),
      // Whoever made first contact claimed it, as the auto-claim rule does (A18).
      claim: { by: author, at: at(firstAt) },
    })
  }

  return withNotifications({ ...base, leads: [...base.leads, ...leads], activities: [...base.activities, ...activities] }, now)
}

function uuidFrom(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
}

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
