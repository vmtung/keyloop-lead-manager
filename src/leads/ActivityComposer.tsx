import { type FormEvent, type KeyboardEvent, useRef, useState } from 'react'
import { describeFailure } from '../api/describeFailure.ts'
import { useAnnounce, useCurrentUser } from '../app/context.tsx'
import { type ActivityId, ActivityType, type LeadId, type NewActivity } from '../contract.ts'
import { ACTIVITY_LABEL } from '../domain/labels.ts'
import { useLogActivity } from './queries.ts'

export const COMPOSER_ID = 'activity-summary'
const MAX = 2000

interface Failed {
  activity: NewActivity
  message: string
}

/**
 * Logs a follow-up optimistically (AC-4.1–4.4). A failed activity keeps its ID, so Retry, or
 * resubmitting the same text, cannot create a duplicate if the first attempt did reach the server.
 */
export function ActivityComposer({ leadId }: { leadId: LeadId }) {
  const { user, status: userStatus } = useCurrentUser()
  const announce = useAnnounce()
  const logActivity = useLogActivity(leadId)
  const [type, setType] = useState<ActivityType>('call')
  const [summary, setSummaryState] = useState('')
  // Mirrors `summary` for the async onError, which runs after the user may have typed again.
  const summaryRef = useRef('')
  const setSummary = (value: string) => {
    summaryRef.current = value
    setSummaryState(value)
  }
  const [failed, setFailed] = useState<Failed | null>(null)

  const trimmed = summary.trim()
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX && user !== undefined

  function send(activity: NewActivity) {
    if (!user) return
    setFailed(null)
    logActivity.mutate(
      { activity, author: user },
      {
        onSuccess: () => announce(`${ACTIVITY_LABEL[activity.type]} logged.`),
        onError: (error) => {
          const message = describeFailure(error)
          setFailed({ activity, message })
          // Put the text back unless the user has started typing something else.
          if (summaryRef.current === '') {
            setSummary(activity.summary)
            setType(activity.type)
          }
          announce(`Activity not saved. ${message}`)
        },
      },
    )
  }

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!canSubmit) return
    const reuse = failed && failed.activity.type === type && failed.activity.summary === trimmed
    const activity: NewActivity = reuse
      ? failed.activity
      : { id: crypto.randomUUID() as ActivityId, type, summary: trimmed }
    setSummary('')
    send(activity)
  }

  function retry() {
    if (!failed) return
    // The restored text is the activity being retried; clear it so it isn't sent twice.
    if (summaryRef.current.trim() === failed.activity.summary) setSummary('')
    send(failed.activity)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit()
  }

  return (
    <form className="composer" onSubmit={submit} aria-label="Log a follow-up">
      <fieldset className="segmented">
        <legend className="visually-hidden">Activity type</legend>
        {ActivityType.options.map((option) => (
          <label key={option} className="segmented__option">
            <input
              type="radio"
              name="activity-type"
              value={option}
              checked={type === option}
              onChange={() => setType(option)}
            />
            <span>{ACTIVITY_LABEL[option]}</span>
          </label>
        ))}
      </fieldset>

      <label htmlFor={COMPOSER_ID} className="visually-hidden">
        Summary
      </label>
      <textarea
        id={COMPOSER_ID}
        className="composer__input"
        rows={3}
        maxLength={MAX}
        placeholder="What happened? e.g. Called customer, left voicemail"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        onKeyDown={onKeyDown}
        aria-describedby={failed ? 'composer-error' : undefined}
      />

      {failed && (
        <div id="composer-error" className="composer__error" role="alert">
          <p>Not saved. {failed.message}</p>
          <button type="button" className="button button--text" onClick={retry}>
            Retry
          </button>
        </div>
      )}

      <div className="composer__footer">
        {userStatus === 'error' ? (
          <p className="meta">Couldn’t load salespeople, so activities can’t be logged.</p>
        ) : summary.length > MAX - 200 ? (
          <p className="meta num">{MAX - summary.length} characters left</p>
        ) : (
          <p className="meta composer__hint">Ctrl or ⌘ + Enter to log</p>
        )}
        <button type="submit" className="button button--primary" disabled={!canSubmit}>
          Log activity
        </button>
      </div>
    </form>
  )
}
