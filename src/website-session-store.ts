import { createHash } from 'node:crypto'
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { z } from 'zod'
import {
  PROFILE_CONTEXT_UNAVAILABLE, WEBSITE_PROFILE_PREFIX, type AuthorizationAuthority,
} from './authorization.js'
import { WEBSITE_SESSION_ORIGIN, websiteSessionSchema } from './protocol.js'
import type { DshChatClientMetadata, WebsiteSession } from './protocol.js'

export interface WebsiteSessionFence {
  accountId: string
  epoch: string
}

const grantSchema = z.strictObject({
  version: z.literal(2),
  origin: z.literal(WEBSITE_SESSION_ORIGIN),
  profileId: z.string().regex(/^chat-profile:[a-f0-9]{64}$/),
  websiteAccountId: z.string().min(1).max(512).nullable(),
  session: websiteSessionSchema.nullable(),
})
const legacyGrantSchema = z.strictObject({
  version: z.literal(1),
  origin: z.literal(WEBSITE_SESSION_ORIGIN),
  fencedDSHaccountId: z.string().min(1).max(512),
  session: websiteSessionSchema,
})
type WebsiteCredentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>
type WebsiteAuthority = Pick<AuthorizationAuthority, 'getSnapshot'>
type LegacyIdentity = (metadata: DshChatClientMetadata, signal: AbortSignal) => Promise<string | null>

/** Derives a profile-specific key in the shared vault, independently of DSH's own login. */
export class WebsiteSessionStore {
  private readonly profileKey: ReturnType<typeof credentialKey> | null
  private pending: Promise<void> = Promise.resolve()
  private writeRevision = 0
  private clearing = false
  private legacyAttempted = false

  constructor(
    private readonly credentials: WebsiteCredentials,
    private readonly authority: WebsiteAuthority,
    private readonly profileId: string | null,
    private readonly legacyIdentity?: LegacyIdentity,
  ) {
    this.profileKey = profileId !== null && /^chat-profile:[a-f0-9]{64}$/.test(profileId)
      ? credentialKey('dsh-deepseek-chat', `website-${profileId.slice(WEBSITE_PROFILE_PREFIX.length)}`)
      : null
  }

  /** Capture before the controller awaits its fence, so an already-issued RPC stays fenced. */
  captureRevision(): number { return this.writeRevision }

  private current(fence: WebsiteSessionFence, signal: AbortSignal): boolean {
    const state = this.authority.getSnapshot()
    return !signal.aborted && state.status === 'authorized'
      && state.error === (this.profileKey === null ? PROFILE_CONTEXT_UNAVAILABLE : null)
      && (this.profileKey === null || fence.accountId === this.profileId)
      && state.accountId === fence.accountId && state.epoch === fence.epoch
  }
  private unchanged(fence: WebsiteSessionFence, signal: AbortSignal, revision: number): boolean {
    return !this.clearing && revision === this.writeRevision && this.current(fence, signal)
  }
  private sessionFromRecord(payload: unknown): WebsiteSession | null {
    const grant = grantSchema.safeParse(payload)
    if (!grant.success || grant.data.profileId !== this.profileId || !grant.data.session
      || grant.data.session.userId !== grant.data.websiteAccountId) return null
    return { ...grant.data.session }
  }
  private payload(session: WebsiteSession | null) {
    return {
      version: 2, origin: WEBSITE_SESSION_ORIGIN, profileId: this.profileId,
      websiteAccountId: session?.userId ?? null, session,
    }
  }
  /** Keep clearing and writes ordered; queued work checks its captured generation again. */
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.pending
    let release!: () => void
    this.pending = new Promise<void>(resolve => { release = resolve })
    await previous
    try { return await operation() }
    finally { release() }
  }

  private async migrateLegacy(
    fence: WebsiteSessionFence, signal: AbortSignal, revision: number, metadata: DshChatClientMetadata,
  ): Promise<WebsiteSession | null> {
    const profileKey = this.profileKey
    if (profileKey === null || this.legacyAttempted || !this.legacyIdentity) return null
    this.legacyAttempted = true
    const id = await this.legacyIdentity(metadata, signal)
    if (!id || id.length > 512 || !this.unchanged(fence, signal, revision)) return null
    // This is the exact old key of this plugin for a public, trusted account id.
    // Never enumerate credentials or read DSH/another plugin's credential record.
    const digest = createHash('sha256').update(id, 'utf8').digest('hex')
    const key = credentialKey('dsh-chat', `website-${digest}`)
    const previous = await this.credentials.readRecord(key)
    if (!this.unchanged(fence, signal, revision) || previous?.kind !== 'grant') return null
    const oldGrant = legacyGrantSchema.safeParse(previous.payload)
    if (!oldGrant.success || oldGrant.data.fencedDSHaccountId !== id) return null
    let migrated = false
    const written = await this.credentials.modifyRecord(profileKey, async current => {
      if (current !== undefined || !this.unchanged(fence, signal, revision)) return undefined
      migrated = true
      return { kind: 'grant', payload: this.payload(oldGrant.data.session) }
    })
    if (!this.unchanged(fence, signal, revision) || written?.kind !== 'grant') return null
    const session = this.sessionFromRecord(written.payload)
    if (migrated && session) {
      // Failure to remove an obsolete copy does not undo a durably saved current grant.
      await this.credentials.deleteRecord(key).catch(() => undefined)
    }
    return this.unchanged(fence, signal, revision) ? session : null
  }

  async load(
    fence: WebsiteSessionFence, signal: AbortSignal, metadata?: DshChatClientMetadata,
    revision = this.writeRevision,
  ): Promise<WebsiteSession | null> {
    const profileKey = this.profileKey
    if (profileKey === null) return null
    try {
      return await this.exclusive(async () => {
        if (!this.unchanged(fence, signal, revision)) return null
        const record = await this.credentials.readRecord(profileKey)
        if (!this.unchanged(fence, signal, revision)) return null
        if (record !== undefined) {
          return record.kind === 'grant' ? this.sessionFromRecord(record.payload) : null
        }
        return metadata ? this.migrateLegacy(fence, signal, revision, metadata) : null
      })
    } catch { throw new Error('无法读取 CHAT 登录。') }
  }

  async save(
    fence: WebsiteSessionFence, session: WebsiteSession, signal: AbortSignal,
    revision = this.writeRevision,
  ): Promise<boolean> {
    const profileKey = this.profileKey
    if (profileKey === null) return false
    const parsed = websiteSessionSchema.safeParse(session)
    if (!parsed.success || !this.unchanged(fence, signal, revision)) return false
    try {
      return await this.exclusive(async () => {
        if (!this.unchanged(fence, signal, revision)) return false
        let accepted = false
        await this.credentials.modifyRecord(profileKey, async () => {
          // The provider may wait for its cross-process write lock before invoking us.
          if (!this.unchanged(fence, signal, revision)) return undefined
          accepted = true
          return { kind: 'grant', payload: this.payload(parsed.data) }
        })
        return accepted && this.unchanged(fence, signal, revision)
      })
    } catch { throw new Error('无法保存 CHAT 登录。') }
  }

  async clear(fence: WebsiteSessionFence, signal: AbortSignal): Promise<boolean> {
    const profileKey = this.profileKey
    // A volatile guest cannot have a plugin-owned persistent grant. Its normal
    // website logout must remain available, without touching any vault record.
    if (profileKey === null) return this.current(fence, signal)
    if (this.clearing || !this.current(fence, signal)) return false
    // Close the Host write barrier synchronously, before waiting for any queued save.
    this.clearing = true
    this.writeRevision++
    try {
      return await this.exclusive(async () => {
        if (!this.current(fence, signal)) return false
        let cleared = false
        await this.credentials.modifyRecord(profileKey, async () => {
          if (!this.current(fence, signal)) return undefined
          cleared = true
          // A durable empty grant prevents an old account-keyed grant being restored again.
          return { kind: 'grant', payload: this.payload(null) }
        })
        return cleared && this.current(fence, signal)
      })
    } catch { throw new Error('无法清除 CHAT 登录。') }
    finally { this.clearing = false }
  }
}
