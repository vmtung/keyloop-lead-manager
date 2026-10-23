import { Component, type ErrorInfo, type ReactNode } from 'react'
import { log, sessionId } from '../observability/log.ts'

interface Props {
  /** "page" replaces the whole app; "pane" replaces one region so the rest keeps working. */
  scope: 'page' | 'pane'
  children: ReactNode
}

/**
 * Catches render errors (AC-7.4), logs them, and shows a recovery screen with a short reference that
 * matches the session ID in the logs, so a salesperson can quote it to support.
 * React only offers error boundaries as class components.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  override state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    log.error('ui.render_error', {
      scope: this.props.scope,
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    })
  }

  override render() {
    if (!this.state.error) return this.props.children
    const reference = sessionId.slice(0, 8)
    const Title = this.props.scope === 'page' ? 'h1' : 'h2'
    return (
      <section className={`crash crash--${this.props.scope}`} role="alert">
        <Title>Something went wrong</Title>
        <p className="meta">
          The error has been logged. If it keeps happening, quote reference{' '}
          <span className="num">{reference}</span>.
        </p>
        <button type="button" className="button button--secondary" onClick={() => location.reload()}>
          Reload
        </button>
      </section>
    )
  }
}
