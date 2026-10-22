// Display text for contract enums. Records keyed by the enum make a missing label a type error.
import type { ActivityType, EnquiryType } from '../contract.ts'
import type { SlaState } from './speedToLead.ts'

export const ENQUIRY_LABEL: Record<EnquiryType, string> = {
  vehicle_enquiry: 'Vehicle enquiry',
  test_drive: 'Test drive',
  part_exchange: 'Part exchange',
  finance: 'Finance',
}

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  call: 'Call',
  email: 'Email',
  sms: 'SMS',
  appointment: 'Appointment',
  note: 'Note',
}

export const SLA_LABEL: Record<SlaState, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  overdue: 'Overdue',
}
