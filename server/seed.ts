// Sample data, with times relative to when the data file is first created so the inbox shows every
// SLA state on a fresh start. All names are fictional; phone numbers are in Ofcom's 07700 900xxx
// range reserved for drama. `pnpm reset-data` deletes the file to re-seed.
import type {
  Activity,
  ActivityId,
  ActivityType,
  IsoDateTime,
  Lead,
  LeadId,
  User,
  UserId,
} from '../src/contract.ts'
import { firstResponseAt } from '../src/domain/speedToLead.ts'
import type { Data } from './store.ts'

export const USERS: User[] = [
  { id: 'anna' as UserId, name: 'Anna Clarke' },
  { id: 'tom' as UserId, name: 'Tom Hughes' },
  { id: 'priya' as UserId, name: 'Priya Shah' },
]
const [anna, tom, priya] = USERS as [User, User, User]

type LeadSeed = Omit<Lead, 'id' | 'receivedAt' | 'firstResponseAt'> & {
  minutesAgo: number
  activities?: { type: ActivityType; summary: string; by: User; minutesAfter: number }[]
}

const LEADS: LeadSeed[] = [
  {
    minutesAgo: 3,
    customer: { name: 'Olivia Bennett', email: 'olivia.bennett@example.com', phone: '07700 900141' },
    enquiryType: 'test_drive',
    message: 'Could I test drive the Sportage on Saturday morning? I have a 2017 Qashqai to part exchange.',
    vehicle: { make: 'Kia', model: 'Sportage', variant: '1.6 T-GDi HEV GT-Line', registration: 'LS73 KXA', pricePence: 3149500 },
  },
  {
    minutesAgo: 12,
    customer: { name: 'Marcus Reid', email: 'marcus.reid@example.com', phone: '07700 900287' },
    enquiryType: 'finance',
    message: 'What would the monthly payment be on PCP over 48 months with £3,000 down?',
    vehicle: { make: 'Volkswagen', model: 'Golf', variant: '1.5 eTSI Life', registration: 'YH24 PMV', pricePence: 2449500 },
  },
  {
    minutesAgo: 38,
    customer: { name: 'Hannah Okafor', email: 'h.okafor@example.com', phone: '07700 900352' },
    enquiryType: 'vehicle_enquiry',
    message: 'Is this still available? Does it come with a full service history?',
    vehicle: { make: 'Ford', model: 'Puma', variant: '1.0 EcoBoost ST-Line', registration: 'MA72 RZT', pricePence: 1899000 },
  },
  {
    minutesAgo: 95,
    customer: { name: 'Daniel Murphy', email: 'dan.murphy@example.com', phone: '07700 900419' },
    enquiryType: 'part_exchange',
    message: 'I want to trade in my 2019 Golf GTI, 41,000 miles. Roughly what would you offer?',
    vehicle: null,
    activities: [
      { type: 'call', summary: 'Called, no answer. Left voicemail with my direct line.', by: tom, minutesAfter: 6 },
      { type: 'email', summary: 'Sent the part-exchange valuation form and asked for photos of the car.', by: tom, minutesAfter: 9 },
    ],
  },
  {
    minutesAgo: 60 * 5,
    customer: { name: 'Aisha Rahman', email: 'aisha.rahman@example.com', phone: '07700 900503' },
    enquiryType: 'test_drive',
    message: 'Interested in the Model 3 Long Range. Weekday evenings work best for a test drive.',
    vehicle: { make: 'Tesla', model: 'Model 3', variant: 'Long Range AWD', registration: 'KM23 FDX', pricePence: 3299000 },
    activities: [
      { type: 'note', summary: 'Repeat customer: bought a Leaf from us in 2021.', by: anna, minutesAfter: 2 },
      { type: 'call', summary: 'Spoke to Aisha. Wants an evening slot, prefers Thursday.', by: anna, minutesAfter: 24 },
      { type: 'appointment', summary: 'Test drive booked for Thursday 18:00.', by: anna, minutesAfter: 27 },
    ],
  },
  {
    minutesAgo: 60 * 26,
    customer: { name: 'George Whitfield', email: 'george.whitfield@example.com', phone: '07700 900618' },
    enquiryType: 'vehicle_enquiry',
    message: 'Does the Tucson have a tow bar option? Need to tow a small caravan.',
    vehicle: { make: 'Hyundai', model: 'Tucson', variant: '1.6 T-GDi Premium', registration: 'WP73 HJN', pricePence: 2795000 },
    activities: [
      { type: 'sms', summary: 'Texted to confirm a detachable tow bar can be fitted; asked when he can come in.', by: priya, minutesAfter: 11 },
      { type: 'call', summary: 'Called back. Visiting Saturday with his wife.', by: priya, minutesAfter: 180 },
    ],
  },
  {
    minutesAgo: 60 * 50,
    customer: { name: 'Chloe Davies', email: 'chloe.davies@example.com', phone: '07700 900774' },
    enquiryType: 'finance',
    message: 'Can I get finance with a 0% deposit? First car.',
    vehicle: { make: 'Toyota', model: 'Yaris', variant: '1.5 Hybrid Icon', registration: 'BD22 OXS', pricePence: 1649500 },
    activities: [
      { type: 'email', summary: 'Sent the finance eligibility checker link and explained deposit options.', by: anna, minutesAfter: 41 },
    ],
  },
  {
    minutesAgo: 60 * 75,
    customer: { name: 'Ravi Patel', email: 'ravi.patel@example.com', phone: '07700 900832' },
    enquiryType: 'vehicle_enquiry',
    message: 'What is the real-world range on the EV6 in winter?',
    vehicle: { make: 'Kia', model: 'EV6', variant: '77.4kWh GT-Line', registration: 'SN23 LCU', pricePence: 3799500 },
    activities: [
      { type: 'call', summary: 'Talked through winter range (about 220 miles) and home charging.', by: tom, minutesAfter: 8 },
      { type: 'note', summary: 'Waiting on his company car scheme approval.', by: tom, minutesAfter: 12 },
    ],
  },
]

function uuidFrom(seed: number): string {
  // Stable, valid v4-shaped UUIDs so seeded IDs survive a reset and deep links keep working.
  const hex = seed.toString(16).padStart(12, '0')
  return `00000000-0000-4000-8000-${hex}`
}

export function seed(now: Date = new Date()): Data {
  const at = (ms: number) => new Date(ms).toISOString() as IsoDateTime
  const leads: Lead[] = []
  const activities: Activity[] = []

  LEADS.forEach((s, i) => {
    const id = uuidFrom(i + 1) as LeadId
    const received = now.getTime() - s.minutesAgo * 60_000
    const own: Activity[] = (s.activities ?? []).map((a, j) => ({
      id: uuidFrom(1000 + i * 10 + j) as ActivityId,
      leadId: id,
      type: a.type,
      summary: a.summary,
      author: a.by,
      occurredAt: at(received + a.minutesAfter * 60_000),
    }))
    activities.push(...own)
    leads.push({
      id,
      customer: s.customer,
      enquiryType: s.enquiryType,
      message: s.message,
      vehicle: s.vehicle,
      receivedAt: at(received),
      firstResponseAt: firstResponseAt(own),
    })
  })

  return { users: USERS, leads, activities }
}
