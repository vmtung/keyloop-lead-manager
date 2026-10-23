// Posts one website enquiry to the running mock API, as the dealership website would (A17).
import { CreateLeadResponse } from '../src/contract.ts'
import { LEAD_SAMPLES } from '../server/samples.ts'

const API = process.env.API_URL ?? 'http://localhost:8787/api'

const sample = LEAD_SAMPLES[Math.floor(Math.random() * LEAD_SAMPLES.length)]!
const res = await fetch(`${API}/leads`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(sample),
})
if (!res.ok) {
  console.error(`Failed: ${res.status} ${await res.text()}`)
  process.exit(1)
}
const { lead } = CreateLeadResponse.parse(await res.json())
console.log(`New lead from ${lead.customer.name} (${lead.id})`)
