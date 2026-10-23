// A rules-based stand-in for AIME (specs A19). In production this would come from AIME's
// qualification, published as an event (design doc, section 11). Pure: the caller passes `now`.
import type { Activity, EnquiryType, Lead, Suggestion } from '../contract.ts'
import { isContactAttempt } from './speedToLead.ts'

const FOLLOW_UP_AFTER_MS = 24 * 60 * 60_000

const FIRST_CALL: Record<EnquiryType, Pick<Suggestion, 'draft' | 'reason'>> = {
  finance: {
    reason: 'Asked about finance. Have a monthly payment quote ready before calling.',
    draft: 'Called about finance options.',
  },
  test_drive: {
    reason: 'Wants a test drive. Offer two or three slots this week.',
    draft: 'Called to book a test drive.',
  },
  part_exchange: {
    reason: 'Has a part exchange. Ask for the mileage and photos for a valuation.',
    draft: 'Called about the part exchange.',
  },
  vehicle_enquiry: {
    reason: 'New enquiry. A call answers it fastest.',
    draft: 'Called to answer the enquiry.',
  },
}

export function suggestNextAction(lead: Lead, activities: readonly Activity[], now: number): Suggestion | null {
  if (activities.some((a) => a.type === 'appointment')) return null

  const contacts = activities.filter((a) => isContactAttempt(a.type))
  if (contacts.length === 0) return { type: 'call', ...FIRST_CALL[lead.enquiryType] }

  const lastContact = Math.max(...contacts.map((a) => Date.parse(a.occurredAt)))
  if (now - lastContact > FOLLOW_UP_AFTER_MS) {
    return {
      type: 'sms',
      reason: 'No appointment a day after the last contact. A short text is easy to answer.',
      draft: 'Texted to follow up and offer a time to come in.',
    }
  }
  return null
}
