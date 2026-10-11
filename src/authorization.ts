import { randomUUID } from 'node:crypto'
import type { AuthorizationState, DshChatClientMetadata } from './protocol.js'

/** Only the public, credential-free identity projection is used for legacy migration. */
export interface AccountReader {
  getState(): Promise<{ status: 'signed-out' | 'credential-stored' }>
  getProfile(metadata: DshChatClientMetadata): Promise<
    { status: 'ready'; value: { id: string | null } } | { status: 'failed' } | null
  >
}

/** Credentials may be shared across profiles; the Host supplies the trusted profile scope. */
export const WEBSITE_PROFILE_PREFIX = 'chat-profile:'
export const PROFILE_CONTEXT_UNAVAILABLE = 'profile-context-unavailable'

/** Host availability and generation fence; website sign-in is a separate Client state. */
export class AuthorizationAuthority {
  private state: AuthorizationState
  private readonly listeners = new Set<() => void>()
  private closed = false

  constructor(profileId: string | null, private readonly issueEpoch: () => string = randomUUID) {
    const epoch = issueEpoch()
    this.state = {
      status: 'authorized', accountId: profileId ?? `chat-volatile:${epoch}`, epoch,
      error: profileId === null ? PROFILE_CONTEXT_UNAVAILABLE : null,
    }
  }

  getSnapshot(): AuthorizationState { return { ...this.state } }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  private publish(next: AuthorizationState): void {
    this.state = next
    for (const listener of this.listeners) listener()
  }

  refresh(_metadata: DshChatClientMetadata): Promise<AuthorizationState> {
    if (this.closed) return Promise.reject(new Error('CHAT session service is disposed.'))
    return Promise.resolve(this.getSnapshot())
  }

  async *watch(_metadata: DshChatClientMetadata, signal: AbortSignal): AsyncIterable<AuthorizationState> {
    let dirty = true
    let wake: (() => void) | undefined
    const changed = () => { dirty = true; wake?.() }
    const unsubscribe = this.subscribe(changed)
    signal.addEventListener('abort', changed, { once: true })
    try {
      while (!signal.aborted && !this.closed) {
        if (dirty) { dirty = false; yield this.getSnapshot(); continue }
        await new Promise<void>(resolve => {
          wake = resolve
          if (dirty || signal.aborted || this.closed) resolve()
        })
      }
    } finally {
      unsubscribe()
      signal.removeEventListener('abort', changed)
    }
  }

  dispose(): void {
    if (this.closed) return
    this.closed = true
    this.publish({ status: 'unauthorized', accountId: null, epoch: this.issueEpoch(), error: null })
    this.listeners.clear()
  }
}
