// Demo tools: trigger the mock's simulations from the app instead of the command line. Development
// builds only (main.tsx loads it behind import.meta.env.DEV), so production never ships it.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Hand, Phone, RotateCcw, Settings, Unplug, UserPlus } from 'lucide-react'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { describeFailure } from '../api/describeFailure.ts'
import { useAnnounce, useApi, useCurrentUser, useNow } from '../app/context.tsx'
import type { ActivityId, DevFaults } from '../contract.ts'
import { nextUp } from '../domain/inbox.ts'
import { leadKeys, useLeads } from '../leads/queries.ts'

const MODES = {
  normal: { label: 'Normal', faults: { latencyMs: { min: 150, max: 600 }, failureRate: 0 } },
  slow: { label: 'Slow', faults: { latencyMs: { min: 1500, max: 2500 }, failureRate: 0 } },
  flaky: { label: 'Flaky', faults: { latencyMs: { min: 300, max: 800 }, failureRate: 0.5 } },
} as const satisfies Record<string, { label: string; faults: DevFaults }>
type Mode = keyof typeof MODES

function modeOf(f: DevFaults | undefined): Mode | undefined {
  return (Object.keys(MODES) as Mode[]).find((m) => JSON.stringify(MODES[m].faults) === JSON.stringify(f))
}

export default function DemoTools() {
  const client = useApi()
  // Defined in every build that can render this component (development only).
  const api = { ...client, dev: client.dev! }
  const queryClient = useQueryClient()
  const announce = useAnnounce()
  const now = useNow()
  const { user, users } = useCurrentUser()
  const leads = useLeads()
  const faults = useQuery({ queryKey: ['dev', 'faults'], queryFn: () => api.dev.getFaults() })
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const toggle = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) panel.current?.querySelector('button')?.focus()
  }, [open])

  // Teammates are whoever isn't signed in here, so their actions arrive like another person's.
  const [caller, claimer] = users.filter((u) => u.id !== user?.id)
  const target = leads.data ? nextUp(leads.data, now) : null

  async function run(name: string, action: () => Promise<string>) {
    setBusy(name)
    setResult(null)
    try {
      const text = await action()
      setResult(text)
      announce(text)
    } catch (error) {
      const text = `${name} failed. ${describeFailure(error)}`
      setResult(text)
      announce(text)
    } finally {
      setBusy(null)
    }
  }

  function close() {
    setOpen(false)
    toggle.current?.focus()
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') close()
  }

  const mode = modeOf(faults.data)

  return (
    <div className="demo" onKeyDown={onKeyDown}>
      {open && (
        <div ref={panel} id="demo-tools" className="demo__panel" role="dialog" aria-labelledby="demo-title">
          <h2 id="demo-title" className="demo__title">Demo tools</h2>
          <p className="meta">Development only. Simulates what happens around the app.</p>

          <h3 className="demo__group">Leads</h3>
          <button type="button" className="demo__action" disabled={busy !== null}
            onClick={() => run('New website lead', async () => {
              const { lead } = await api.dev.simulateLead()
              return `New website lead from ${lead.customer.name}.`
            })}>
            <UserPlus aria-hidden size={16} /> New website lead
          </button>
          <button type="button" className="demo__action" disabled={busy !== null || !target || !caller}
            onClick={() => run('Teammate call', async () => {
              const id = crypto.randomUUID() as ActivityId
              await api.createActivity(target!.id, { id, type: 'call', summary: 'Called, left a voicemail.' }, caller!.id)
              return `${caller!.name} called ${target!.customer.name}.`
            })}>
            <Phone aria-hidden size={16} />
            {caller && target ? `${firstName(caller.name)} calls ${target.customer.name}` : 'Teammate calls the next lead'}
          </button>
          <button type="button" className="demo__action"
            disabled={busy !== null || !target || !claimer || target.claim !== null}
            onClick={() => run('Teammate claim', async () => {
              await api.claimLead(target!.id, claimer!.id)
              return `${claimer!.name} claimed ${target!.customer.name}.`
            })}>
            <Hand aria-hidden size={16} />
            {claimer && target ? `${firstName(claimer.name)} claims ${target.customer.name}` : 'Teammate claims the next lead'}
          </button>

          <h3 className="demo__group">Connection</h3>
          <button type="button" className="demo__action" disabled={busy !== null}
            onClick={() => run('Drop connection', async () => {
              const { dropped } = await api.dev.dropStreams()
              return `Dropped ${dropped} live ${dropped === 1 ? 'connection' : 'connections'}. Watch the top bar.`
            })}>
            <Unplug aria-hidden size={16} /> Drop live connection
          </button>
          <fieldset className="demo__modes" disabled={busy !== null || !faults.data}>
            <legend className="demo__legend">API</legend>
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <label key={m} className="segmented__option">
                <input type="radio" name="demo-mode" value={m} checked={mode === m}
                  onChange={() => run('Change API mode', async () => {
                    await api.dev.setFaults(MODES[m].faults)
                    await queryClient.invalidateQueries({ queryKey: ['dev', 'faults'] })
                    return `API is now ${MODES[m].label.toLowerCase()}.`
                  })} />
                <span>{MODES[m].label}</span>
              </label>
            ))}
          </fieldset>

          <h3 className="demo__group">Data</h3>
          <button type="button" className="demo__action" disabled={busy !== null}
            onClick={() => run('Reset', async () => {
              await api.dev.reset()
              await queryClient.invalidateQueries({ queryKey: leadKeys.all })
              return 'Sample data reset, with fresh timers.'
            })}>
            <RotateCcw aria-hidden size={16} /> Reset sample data
          </button>

          {result && <p className="demo__result" role="status">{result}</p>}
        </div>
      )}
      <button ref={toggle} type="button" className="demo__toggle" aria-expanded={open} aria-controls="demo-tools"
        onClick={() => (open ? close() : setOpen(true))}>
        <Settings aria-hidden size={20} />
        <span className="visually-hidden">Demo tools</span>
      </button>
    </div>
  )
}

const firstName = (name: string) => name.split(' ')[0] ?? name
