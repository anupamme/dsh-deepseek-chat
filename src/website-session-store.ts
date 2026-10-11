import { createHash } from 'node:crypto'
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { z } from 'zod'
import type { AuthorizationAuthority } from './authorization.js'
import { WEBSITE_SESSION_ORIGIN, websiteSessionSchema } from './protocol.js'
import type { WebsiteSession } from './protocol.js'

export interface WebsiteSessionFence {
  accountId: string
  epoch: string
}

const grantSchema = z.strictObject({
  version: z.literal(1),
  origin: z.literal(WEBSITE_SESSION_ORIGIN),
  fencedDSHaccountId: z.string().min(1).max(512),
  session: websiteSessionSchema,
})
type WebsiteCredentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>
type WebsiteAuthority = Pick<AuthorizationAuthority, 'getSnapshot'>

/** Owns only explicitly supplied CHAT website grants, never the official DSH account grant. */
export class WebsiteSessionStore {
  private pending: Promise<void> = Promise.resolve()

  constructor(private readonly credentials: WebsiteCredentials, private readonly authority: WebsiteAuthority) {}

  private current(fence: WebsiteSessionFence, signal: AbortSignal): boolean {
    const state = this.authority.getSnapshot()
    return !signal.aborted && state.status === 'authorized' && state.error === null
      && state.accountId === fence.accountId && state.epoch === fence.epoch
  }
  private key(fence: WebsiteSessionFence) {
    const digest = createHash('sha256').update(fence.accountId, 'utf8').digest('hex')
    return credentialKey('dsh-chat', `website-${digest}`)
  }
  /** Keep delayed clearing/writing ordered; a new generation rechecks its fence after waiting. */
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.pending
    let release!: () => void
    this.pending = new Promise<void>(resolve => { release = resolve })
    await previous
    try { return await operation() }
    finally { release() }
  }

  async load(fence: WebsiteSessionFence, signal: AbortSignal): Promise<WebsiteSession | null> {
    try {
      return await this.exclusive(async () => {
        if (!this.current(fence, signal)) return null
        const record = await this.credentials.readRecord(this.key(fence))
        if (!this.current(fence, signal) || record?.kind !== 'grant') return null
        const grant = grantSchema.safeParse(record.payload)
        if (!grant.success || grant.data.fencedDSHaccountId !== fence.accountId) return null
        return this.current(fence, signal) ? { ...grant.data.session } : null
      })
    } catch { throw new Error('无法读取 CHAT 登录。') }
  }

  async save(fence: WebsiteSessionFence, session: WebsiteSession, signal: AbortSignal): Promise<boolean> {
    try {
      const parsed = websiteSessionSchema.safeParse(session)
      if (!parsed.success) return false
      return await this.exclusive(async () => {
        if (!this.current(fence, signal)) return false
        let accepted = false
        await this.credentials.modifyRecord(this.key(fence), async () => {
          // The credentials provider may wait for its cross-process write lock first.
          if (!this.current(fence, signal)) return undefined
          accepted = true
          return { kind: 'grant', payload: {
            version: 1, origin: WEBSITE_SESSION_ORIGIN,
            fencedDSHaccountId: fence.accountId, session: parsed.data,
          } }
        })
        return accepted && this.current(fence, signal)
      })
    } catch { throw new Error('无法保存 CHAT 登录。') }
  }

  async clear(fence: WebsiteSessionFence, signal: AbortSignal): Promise<boolean> {
    try {
      return await this.exclusive(async () => {
        if (!this.current(fence, signal)) return false
        // The address comes only from the captured trusted identity; no other account is deleted.
        await this.credentials.deleteRecord(this.key(fence))
        return this.current(fence, signal)
      })
    } catch { throw new Error('无法清除 CHAT 登录。') }
  }
}
