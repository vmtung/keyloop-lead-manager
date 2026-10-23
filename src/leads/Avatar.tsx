import type { User } from '../contract.ts'

// Pale identity tints, at least 60° apart and away from the signal colours (amber, red) and the
// data blue, so a person never reads as a status.
const TINTS = ['teal', 'sky', 'olive', 'sand'] as const

/** The same person gets the same tint everywhere. */
function tintFor(id: string): (typeof TINTS)[number] {
  let sum = 0
  for (const ch of id) sum += ch.charCodeAt(0)
  return TINTS[sum % TINTS.length]!
}

function initials(name: string): string {
  const [first = '', second = ''] = name.trim().split(/\s+/)
  return (first.charAt(0) + second.charAt(0)).toUpperCase()
}

/** Initials in the person's tint. Decorative: the name is always written beside it. */
export function Avatar({ user, size = 'small' }: { user: User; size?: 'small' | 'medium' }) {
  return (
    <span className={`avatar avatar--${size} avatar--${tintFor(user.id)}`} aria-hidden>
      {initials(user.name)}
    </span>
  )
}
