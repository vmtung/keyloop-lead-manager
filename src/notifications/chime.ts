// A short two-note chime for new leads (AC-11.4), made with Web Audio so there is no file to load.
// Off by default; the choice is remembered in this browser.
import { log } from '../observability/log.ts'

const SOUND_KEY = 'lead-manager.sound'
let context: AudioContext | null = null

export function isSoundOn(): boolean {
  try {
    return localStorage.getItem(SOUND_KEY) === 'on'
  } catch (error) {
    log.warn('storage.read_failed', { key: SOUND_KEY, message: String(error) })
    return false
  }
}

/** Called from the switch, a user gesture, which is when browsers let a page start audio. */
export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? 'on' : 'off')
  } catch (error) {
    // The choice then lasts until reload.
    log.warn('storage.write_failed', { key: SOUND_KEY, message: String(error) })
  }
  if (on) void audio()?.resume()
}

export function playChime() {
  const ctx = audio()
  if (!ctx) return
  // After a reload the context starts suspended until the page has had a click or key press.
  if (ctx.state === 'suspended') {
    void ctx.resume().catch((error: unknown) => log.warn('sound.blocked', { message: String(error) }))
  }
  const start = ctx.currentTime
  for (const [i, frequency] of [880, 1320].entries()) {
    const at = start + i * 0.14
    const tone = ctx.createOscillator()
    const gain = ctx.createGain()
    tone.type = 'sine'
    tone.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.15, at + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3)
    tone.connect(gain).connect(ctx.destination)
    tone.start(at)
    tone.stop(at + 0.32)
  }
}

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  context ??= new AudioContext()
  return context
}
