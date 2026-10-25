// A dealership's worth of history for the demo tools' "Load 5,000 leads" (AC-1.8): contacted leads
// spread over the last 30 days, each with a first contact. Seeded, so every run makes the same data.
import type { Activity, ActivityId, ActivityType, EnquiryType, IsoDateTime, Lead, LeadId } from '../src/contract.ts'
import { USERS } from './seed.ts'
import type { Data } from './store.ts'

const COUNT = 5000
const DAY_MS = 24 * 60 * 60_000

const FIRST = ['Amelia', 'Oliver', 'Isla', 'Jack', 'Ava', 'Noah', 'Mia', 'Leo', 'Freya', 'Arthur', 'Grace', 'Oscar', 'Zara', 'Harry', 'Priya', 'Kwame', 'Sofia', 'Ewan', 'Leila', 'Mateo']
const LAST = ['Smith', 'Jones', 'Taylor', 'Brown', 'Wilson', 'Evans', 'Khan', 'Singh', 'Walsh', 'Hughes', 'Clarke', 'Mensah', 'Novak', 'Rossi', 'Begum', 'Price', 'Fraser', 'Doyle', 'Shah', 'Lewis']
const ENQUIRIES: EnquiryType[] = ['vehicle_enquiry', 'test_drive', 'finance', 'part_exchange']
const VEHICLES = [
  { make: 'Ford', model: 'Puma', variant: '1.0 EcoBoost ST-Line', pricePence: 1899000 },
  { make: 'Kia', model: 'Sportage', variant: '1.6 T-GDi HEV GT-Line', pricePence: 3149500 },
  { make: 'Volkswagen', model: 'Golf', variant: '1.5 eTSI Life', pricePence: 2449500 },
  { make: 'Toyota', model: 'Yaris', variant: '1.5 Hybrid Icon', pricePence: 1649500 },
  { make: 'Hyundai', model: 'Tucson', variant: '1.6 T-GDi Premium', pricePence: 2795000 },
]
const CONTACTS: { type: ActivityType; summary: string }[] = [
  { type: 'call', summary: 'Called, answered the questions in the enquiry.' },
  { type: 'call', summary: 'Called, no answer. Left a voicemail.' },
  { type: 'email', summary: 'Emailed the details and offered a time to visit.' },
  { type: 'sms', summary: 'Texted to arrange a call back.' },
]

/** The sample data plus COUNT older contacted leads. IDs start well clear of the sample's. */
export function scale(base: Data, now: Date): Data {
  const random = mulberry32(2026)
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!
  const at = (ms: number) => new Date(ms).toISOString() as IsoDateTime
  const leads: Lead[] = []
  const activities: Activity[] = []

  for (let i = 0; i < COUNT; i++) {
    const id = uuidFrom(0x100000 + i) as LeadId
    const name = `${pick(FIRST)} ${pick(LAST)}`
    const received = now.getTime() - DAY_MS * 30 * random() - 2 * 60 * 60_000
    // Mostly quick, with a long tail, as a real team's response times look.
    const responseMs = Math.round(60_000 * (1 + 120 * random() ** 3))
    const vehicle = random() < 0.85 ? { ...pick(VEHICLES), registration: null } : null
    const author = pick(USERS)
    const contact = pick(CONTACTS)
    const firstResponse = at(received + responseMs)
    activities.push({
      id: uuidFrom(0x200000 + i) as ActivityId,
      leadId: id,
      type: contact.type,
      summary: contact.summary,
      author,
      occurredAt: firstResponse,
    })
    leads.push({
      id,
      customer: {
        name,
        email: `${name.toLowerCase().replace(' ', '.')}@example.com`,
        phone: `07700 900${String(i % 1000).padStart(3, '0')}`,
      },
      enquiryType: pick(ENQUIRIES),
      message: 'Is this still available?',
      vehicle,
      receivedAt: at(received),
      firstResponseAt: firstResponse,
      claim: { by: author, at: firstResponse },
    })
  }

  return { ...base, leads: [...base.leads, ...leads], activities: [...base.activities, ...activities] }
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
