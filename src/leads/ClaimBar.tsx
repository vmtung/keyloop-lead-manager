import { useQueryClient } from '@tanstack/react-query'
import { UserRound } from 'lucide-react'
import { useState } from 'react'
import type { z } from 'zod'
import { ApiError } from '../api/client.ts'
import { describeFailure } from '../api/describeFailure.ts'
import { useAnnounce, useCurrentUser } from '../app/context.tsx'
import type { Lead, LeadDetailResponse } from '../contract.ts'
import { formatWhen } from '../domain/format.ts'
import { Avatar } from './Avatar.tsx'
import { leadKeys, useClaim } from './queries.ts'

/** Who has this lead, and the one action that fits: Claim, Release, or nothing (AC-8.1, 8.2). */
export function ClaimBar({ lead, now }: { lead: Lead; now: number }) {
  const { user } = useCurrentUser()
  const claim = useClaim(lead.id)
  const queryClient = useQueryClient()
  const announce = useAnnounce()
  const [message, setMessage] = useState<string | null>(null)

  function act(action: 'claim' | 'release') {
    if (!user) return
    setMessage(null)
    claim.mutate(
      { action, user },
      {
        onSuccess: () => announce(action === 'claim' ? `You claimed ${lead.customer.name}.` : 'Claim released.'),
        onError: (error) => {
          const lost = error instanceof ApiError && error.failure.kind === 'http' && error.failure.code === 'claim_conflict'
          // The mutation refetched the lead on a 409, so the cache now knows who won.
          const owner = queryClient.getQueryData<z.output<typeof LeadDetailResponse>>(leadKeys.detail(lead.id))?.lead
            .claim?.by.name
          const text = lost && owner ? `${owner} claimed this lead first.` : describeFailure(error)
          setMessage(text)
          announce(text)
        },
      },
    )
  }

  const owner = lead.claim
  const mine = owner !== null && owner.by.id === user?.id

  return (
    <div className="claim">
      <p className="claim__state">
        {owner === null ? <UserRound aria-hidden size={16} /> : <Avatar user={owner.by} size="medium" />}
        {owner === null ? (
          <span>Unclaimed</span>
        ) : (
          <span>
            {mine ? 'You claimed this' : `Claimed by ${owner.by.name}`}
            <span className="meta num"> · {formatWhen(owner.at, now)}</span>
          </span>
        )}
      </p>
      {owner === null && (
        <button type="button" className="button button--secondary" disabled={claim.isPending || !user}
          onClick={() => act('claim')}>
          {claim.isPending ? 'Claiming…' : 'Claim'}
        </button>
      )}
      {mine && (
        <button type="button" className="button button--text" disabled={claim.isPending} onClick={() => act('release')}>
          Release
        </button>
      )}
      {message && <p className="claim__message">{message}</p>}
    </div>
  )
}
