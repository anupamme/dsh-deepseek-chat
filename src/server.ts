import { Context } from '@deepseek-ai/cordis'
import { createHash } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-typert-registry'
import {
  AuthorizationAuthority, PROFILE_CONTEXT_UNAVAILABLE, WEBSITE_PROFILE_PREFIX, type AccountReader,
} from './authorization.js'
import {
  DSH_CHAT_HOST_CONTRIBUTION, authorizationEpochSchema, clientMetadataSchema, websiteSessionSchema,
} from './protocol.js'
import type { AuthorizationState, DshChatClientMetadata, WebsiteSession } from './protocol.js'
import { WebsiteSessionStore, type WebsiteSessionFence } from './website-session-store.js'

/** Independent CHAT website session service scoped to the current DSH profile. */
export class DshChatController extends TypertRemoteService {
  static inject = ['credentials', 'typert']
  readonly authority: AuthorizationAuthority
  private readonly websiteSessions: WebsiteSessionStore
  private legacyAccount: AccountReader | undefined
  constructor(ctx: Context) {
    super(ctx, 'dshDeepseekChat')
    // Public launcher-owned metadata, never a Client-selected path or an account login.
    const profile: unknown = ctx.get('profileContext')
    const dir = profile !== null && typeof profile === 'object' && 'dir' in profile
      ? profile.dir : undefined
    const profileId = typeof dir === 'string' && dir.length <= 16_384 && isAbsolute(dir)
      && !dir.includes('\0')
      ? `${WEBSITE_PROFILE_PREFIX}${createHash('sha256').update(resolve(dir), 'utf8').digest('hex')}`
      : null
    this.authority = new AuthorizationAuthority(profileId)
    this.websiteSessions = new WebsiteSessionStore(ctx.credentials, this.authority, profileId,
      (metadata, signal) => this.legacyAccountId(metadata, signal))
    ctx.typert.register(DSH_CHAT_HOST_CONTRIBUTION)
    // An optional public identity can locate this plugin's one old account-keyed grant.
    // Neither DSH sign-out nor an expired DSH grant changes CHAT availability.
    ctx.inject(['deepseekAccount'], child => {
      const account = child.deepseekAccount
      this.legacyAccount = account
      child.effect(() => () => { if (this.legacyAccount === account) this.legacyAccount = undefined })
    })
    ctx.effect(() => () => { this.authority.dispose() }, 'dsh-deepseek-chat profile session lifetime')
  }

  private async legacyAccountId(metadata: DshChatClientMetadata, signal: AbortSignal): Promise<string | null> {
    const account = this.legacyAccount
    if (!account || signal.aborted) return null
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled: (() => void) | undefined
    try {
      return await Promise.race([
        (async () => {
          if ((await account.getState()).status !== 'credential-stored' || signal.aborted) return null
          const profile = await account.getProfile(metadata)
          return !signal.aborted && profile?.status === 'ready' ? profile.value.id : null
        })(),
        new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 1_500) }),
        new Promise<null>(resolve => {
          cancelled = () => resolve(null)
          signal.addEventListener('abort', cancelled, { once: true })
          if (signal.aborted) cancelled()
        }),
      ])
    } catch { return null }
    finally {
      clearTimeout(timer)
      if (cancelled) signal.removeEventListener('abort', cancelled)
    }
  }
  @Remote
  async authorization(metadata: DshChatClientMetadata, signal: AbortSignal): Promise<AuthorizationState> {
    try {
      signal.throwIfAborted()
      const state = await this.authority.refresh(clientMetadataSchema.parse(metadata))
      signal.throwIfAborted()
      return state
    } catch {
      throw new RemoteError('gateway/internal', '无法连接 CHAT 登录保存服务，请检查 DSH 服务。', {})
    }
  }
  @Remote({ mode: 'stream' })
  async *watchAuthorization(metadata: DshChatClientMetadata, signal: AbortSignal): AsyncIterable<AuthorizationState> {
    try { yield* this.authority.watch(clientMetadataSchema.parse(metadata), signal) }
    catch { throw new RemoteError('gateway/internal', '无法连接 CHAT 登录保存服务，请检查 DSH 服务。', {}) }
  }

  private async websiteFence(metadata: DshChatClientMetadata, epoch: string, signal: AbortSignal): Promise<WebsiteSessionFence | null> {
    signal.throwIfAborted()
    const expectedEpoch = authorizationEpochSchema.parse(epoch)
    const state = await this.authority.refresh(clientMetadataSchema.parse(metadata))
    signal.throwIfAborted()
    const current = this.authority.getSnapshot()
    if (state.status !== 'authorized'
      || (state.error !== null && state.error !== PROFILE_CONTEXT_UNAVAILABLE) || !state.accountId
      || state.accountId.length > 512 || state.epoch !== expectedEpoch
      || current.status !== 'authorized' || current.error !== state.error
      || current.accountId !== state.accountId || current.epoch !== expectedEpoch) return null
    return { accountId: state.accountId, epoch: expectedEpoch }
  }

  @Remote
  async loadWebsiteSession(metadata: DshChatClientMetadata, epoch: string, signal: AbortSignal): Promise<WebsiteSession | null> {
    try {
      const revision = this.websiteSessions.captureRevision()
      const fence = await this.websiteFence(metadata, epoch, signal)
      return fence ? await this.websiteSessions.load(fence, signal, metadata, revision) : null
    } catch { throw new RemoteError('gateway/internal', '无法恢复 CHAT 登录，请重试。', {}) }
  }

  @Remote
  async saveWebsiteSession(metadata: DshChatClientMetadata, epoch: string, session: WebsiteSession, signal: AbortSignal): Promise<boolean> {
    try {
      const revision = this.websiteSessions.captureRevision()
      const parsed = websiteSessionSchema.parse(session)
      const fence = await this.websiteFence(metadata, epoch, signal)
      return fence ? await this.websiteSessions.save(fence, parsed, signal, revision) : false
    } catch { throw new RemoteError('gateway/internal', '无法保存 CHAT 登录，请重试。', {}) }
  }

  @Remote
  async clearWebsiteSession(metadata: DshChatClientMetadata, epoch: string, signal: AbortSignal): Promise<boolean> {
    try {
      const fence = await this.websiteFence(metadata, epoch, signal)
      return fence ? await this.websiteSessions.clear(fence, signal) : false
    } catch { throw new RemoteError('gateway/internal', '无法清除 CHAT 登录，请重试。', {}) }
  }
}

declare module '@deepseek-ai/cordis' { interface Context { dshDeepseekChat: DshChatController } }
