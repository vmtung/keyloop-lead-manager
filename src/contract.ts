// API contract shared by the app and the mock server. specs/api-contract.md describes the endpoints;
// these schemas are the source of truth for the shapes. The app parses every response with them.
import { z } from 'zod'

export const LeadId = z.uuid().brand<'LeadId'>()
export type LeadId = z.infer<typeof LeadId>

export const ActivityId = z.uuid().brand<'ActivityId'>()
export type ActivityId = z.infer<typeof ActivityId>

export const UserId = z.string().min(1).max(64).brand<'UserId'>()
export type UserId = z.infer<typeof UserId>

/** UTC timestamp, e.g. 2026-10-22T09:15:00.000Z */
export const IsoDateTime = z.iso.datetime().brand<'IsoDateTime'>()
export type IsoDateTime = z.infer<typeof IsoDateTime>

export const EnquiryType = z.enum(['vehicle_enquiry', 'test_drive', 'part_exchange', 'finance'])
export type EnquiryType = z.infer<typeof EnquiryType>

export const ActivityType = z.enum(['call', 'email', 'sms', 'appointment', 'note'])
export type ActivityType = z.infer<typeof ActivityType>

export const User = z.object({
  id: UserId,
  name: z.string().min(1).max(100),
})
export type User = z.infer<typeof User>

export const Customer = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email(),
  phone: z.string().trim().min(1).max(30),
})
export type Customer = z.infer<typeof Customer>

export const Vehicle = z.object({
  make: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(50),
  variant: z.string().trim().max(100).nullable(),
  registration: z.string().trim().max(10).nullable(),
  pricePence: z.int().nonnegative().nullable(),
})
export type Vehicle = z.infer<typeof Vehicle>

export const Lead = z.object({
  id: LeadId,
  customer: Customer,
  enquiryType: EnquiryType,
  message: z.string().max(5000),
  vehicle: Vehicle.nullable(),
  receivedAt: IsoDateTime,
  /** Time of the first contact attempt; null while awaiting response. Set by the server. */
  firstResponseAt: IsoDateTime.nullable(),
  /** Who has taken the lead on (specs A18). Defaults to null so data files from before claims load. */
  claim: z.object({ by: User, at: IsoDateTime }).nullable().default(null),
})
export type Lead = z.infer<typeof Lead>

export const Activity = z.object({
  id: ActivityId,
  leadId: LeadId,
  type: ActivityType,
  summary: z.string().trim().min(1).max(2000),
  author: User,
  occurredAt: IsoDateTime,
})
export type Activity = z.infer<typeof Activity>

// Requests

export const LeadGroup = z.enum(['awaiting', 'contacted'])
export type LeadGroup = z.infer<typeof LeadGroup>
export const LeadListQuery = z.object({
  group: LeadGroup,
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const NewActivity = Activity.pick({ id: true, type: true, summary: true })
export type NewActivity = z.infer<typeof NewActivity>

export const NewLead = Lead.pick({ customer: true, enquiryType: true, message: true, vehicle: true })
export type NewLead = z.infer<typeof NewLead>

// Responses

export const UserListResponse = z.object({ users: z.array(User) })
export const LeadListResponse = z.object({ leads: z.array(Lead) })
/** One page of contacted leads (ADR-006). `nextCursor` is opaque; null on the last page. */
export const LeadPageResponse = z.object({
  leads: z.array(Lead),
  nextCursor: z.string().min(1).nullable(),
  total: z.int().nonnegative(),
})
export type LeadPageResponse = z.infer<typeof LeadPageResponse>
/** The 24-hour figures (AC-1.6), computed by the server over every lead. */
export const ResponseStats = z.object({
  answered: z.int().nonnegative(),
  withinTargetShare: z.number().min(0).max(1).nullable(),
  medianResponseMs: z.number().nonnegative().nullable(),
})
export type ResponseStats = z.infer<typeof ResponseStats>
/** Per salesperson (AC-10.1): the 24-hour figures for leads they answered first, and their waiting load. */
export const TeamMemberStats = ResponseStats.extend({
  user: User,
  claimedWaiting: z.int().nonnegative(),
  claimedOverdue: z.int().nonnegative(),
})
export type TeamMemberStats = z.infer<typeof TeamMemberStats>
export const TeamStatsResponse = z.object({ people: z.array(TeamMemberStats) })
/** A suggested next step from the rules-based AIME stand-in (specs A19). Never acted on by itself. */
export const Suggestion = z.object({
  type: ActivityType,
  draft: z.string().min(1).max(2000),
  reason: z.string().min(1),
})
export type Suggestion = z.infer<typeof Suggestion>

export const LeadDetailResponse = z.object({
  lead: Lead,
  activities: z.array(Activity),
  suggestion: Suggestion.nullable(),
})
export const CreateActivityResponse = z.object({ activity: Activity, lead: Lead })
export const LeadResponse = z.object({ lead: Lead })
export const CreateLeadResponse = LeadResponse

export const ApiErrorCode = z.enum([
  'validation_failed',
  'not_found',
  'idempotency_conflict',
  'claim_conflict',
  'forbidden',
  'unauthenticated',
  'internal',
])
export type ApiErrorCode = z.infer<typeof ApiErrorCode>

export const ApiErrorResponse = z.object({
  error: z.object({ code: ApiErrorCode, message: z.string() }),
})

// Client logs (POST /api/logs)

export const ClientLogEntry = z.object({
  ts: IsoDateTime,
  level: z.enum(['info', 'warn', 'error']),
  event: z.string().min(1).max(100),
  sessionId: z.uuid(),
  fields: z.record(z.string(), z.unknown()),
})
export type ClientLogEntry = z.infer<typeof ClientLogEntry>

export const ClientLogBatch = z.object({ entries: z.array(ClientLogEntry).min(1).max(100) })
export type ClientLogBatch = z.infer<typeof ClientLogBatch>

// Notifications (A21, ADR-007). The ID names the source: `lead:<id>` or `activity:<id>`.

export const Notification = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('new_lead'),
    id: z.string().min(1).max(100),
    at: IsoDateTime,
    for: z.null(),
    leadId: LeadId,
    customerName: z.string().min(1),
    enquiryType: EnquiryType,
  }),
  z.object({
    kind: z.literal('teammate_activity'),
    id: z.string().min(1).max(100),
    at: IsoDateTime,
    for: UserId,
    leadId: LeadId,
    customerName: z.string().min(1),
    actor: User,
    activityType: ActivityType,
  }),
])
export type Notification = z.infer<typeof Notification>

export const NotificationListQuery = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})
export const NotificationPageResponse = z.object({
  notifications: z.array(Notification),
  nextCursor: z.string().min(1).nullable(),
  /** Anything newer than this is unread; null if this person has never opened the list. */
  lastReadAt: IsoDateTime.nullable(),
})
export type NotificationPageResponse = z.infer<typeof NotificationPageResponse>
export const UnreadResponse = z.object({ unread: z.int().nonnegative() })

// Server-sent events on GET /api/events. Events are thin: the client refetches what changed.

export const ServerEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('lead.created'), leadId: LeadId }),
  z.object({ type: z.literal('lead.updated'), leadId: LeadId }),
  z.object({ type: z.literal('activity.created'), leadId: LeadId, activityId: ActivityId }),
])
export type ServerEvent = z.infer<typeof ServerEvent>

// Dev endpoints (mock server only): the demo tools change these at runtime.

export const DevFaults = z
  .object({
    latencyMs: z.object({ min: z.int().nonnegative(), max: z.int().nonnegative() }),
    failureRate: z.number().min(0).max(1),
  })
  .refine((f) => f.latencyMs.max >= f.latencyMs.min, { message: 'latencyMs.max must be >= min' })
export type DevFaults = z.infer<typeof DevFaults>

export const DropStreamsResponse = z.object({ dropped: z.int().nonnegative() })

export const DevTracing = z.object({ enabled: z.boolean() })
export type DevTracing = z.infer<typeof DevTracing>
