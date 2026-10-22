import { useEffect } from 'react'
import { COMPOSER_ID } from '../leads/ActivityComposer.tsx'

/**
 * Inbox triage keys (AC-6.1): j / k move focus through the lead list, Enter opens the focused lead
 * (a native link), c jumps to the composer. Ignored while typing or with a modifier held.
 */
export function useShortcuts() {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return
      switch (event.key) {
        case 'j':
          moveFocus(1)
          break
        case 'k':
          moveFocus(-1)
          break
        case 'c': {
          const composer = document.getElementById(COMPOSER_ID)
          if (!composer) return
          event.preventDefault() // keep the "c" out of the textarea
          composer.focus()
          break
        }
        default:
          return
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}

function moveFocus(step: 1 | -1) {
  const links = [...document.querySelectorAll<HTMLElement>('[data-lead-link]')]
  if (links.length === 0) return
  const focused = links.indexOf(document.activeElement as HTMLElement)
  const selected = links.findIndex((l) => l.getAttribute('aria-current') === 'page')
  const from = focused !== -1 ? focused : selected
  const next = from === -1 ? (step === 1 ? 0 : links.length - 1) : from + step
  links[Math.min(links.length - 1, Math.max(0, next))]?.focus()
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}
