// Website enquiries for demos: used by `pnpm simulate:lead` and the demo tools' "New website lead".
import type { NewLead } from '../src/contract.ts'

export const LEAD_SAMPLES: NewLead[] = [
  {
    customer: { name: 'Ellie Turner', email: 'ellie.turner@example.com', phone: '07700 900905' },
    enquiryType: 'test_drive',
    message: 'Can I book a test drive for this week? I finish work at 5.',
    vehicle: { make: 'Nissan', model: 'Qashqai', variant: '1.3 DIG-T MHEV N-Connecta', registration: 'LB23 VRK', pricePence: 2399000 },
  },
  {
    customer: { name: 'Samuel Adeyemi', email: 'sam.adeyemi@example.com', phone: '07700 900916' },
    enquiryType: 'finance',
    message: 'What APR could I get on this? Looking at about £350 a month.',
    vehicle: { make: 'BMW', model: '3 Series', variant: '320i M Sport', registration: 'WR22 YTE', pricePence: 2899500 },
  },
  {
    customer: { name: 'Fiona MacLeod', email: 'fiona.macleod@example.com', phone: '07700 900927' },
    enquiryType: 'part_exchange',
    message: 'I have a 2020 Fiesta with 28k miles. Would you take it in part exchange?',
    vehicle: { make: 'Ford', model: 'Kuga', variant: '2.5 PHEV ST-Line', registration: 'DY73 GHA', pricePence: 3099000 },
  },
  {
    customer: { name: 'Tomasz Nowak', email: 'tomasz.nowak@example.com', phone: '07700 900938' },
    enquiryType: 'vehicle_enquiry',
    message: 'Has this car had any accident damage? Is the warranty transferable?',
    vehicle: { make: 'Skoda', model: 'Octavia', variant: '2.0 TDI SE L Estate', registration: 'NX72 BLU', pricePence: 2149500 },
  },
]
