import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {} from '@deepseek-ai/dsh-deepseek-account'
import type {} from '@deepseek-ai/dsh-credentials'
import type {} from '@deepseek-ai/dsh-typert-registry'
import { AuthorizationAuthority } from './authorization.js'
import {
  DSH_CHAT_HOST_CONTRIBUTION, authorizationEpochSchema, clientMetadataSchema, websiteSessionSchema,
} from './protocol.js'
import type { AuthorizationState, DshChatClientMetadata, WebsiteSession } from './protocol.js'
import { WebsiteSessionStore, type WebsiteSessionFence } from './website-session-store.js'

/** Fixed official rc.2 ownership key; the event exposes only this key, never its record. */
const ACCOUNT_RECORD_KEY = 'deepseek-account-platform/default'

/** Official DSH identity gates a separate, plugin-owned CHAT website credential store. */
export class DshChatController extends TypertRemoteService {
  static inject = ['deepseekAccount', 'credentials', 'typert']
  readonly authority: AuthorizationAuthority
  private readonly websiteSessions: WebsiteSessionStore
  constructor(ctx: Context) {
    super(ctx, 'dshChat')
    this.authority = new AuthorizationAuthority(ctx.deepseekAccount)
    this.websiteSessions = new WebsiteSessionStore(ctx.credentials, this.authority)
    ctx.typert.register(DSH_CHAT_HOST_CONTRIBUTION)
    ctx.on('deepseek-account/signed-out', () => { this.authority.invalidate() })
    ctx.on('deepseek-account/session-expired', () => { this.authority.invalidate() })
    ctx.on('credentials/record-updated', key => {
      if (String(key) === ACCOUNT_RECORD_KEY) this.authority.grantChanged()
    })
    ctx.effect(() => () => { this.authority.dispose() }, 'dsh-chat safe account observation lifetime')
  }
  @Remote
  async authorization(metadata: DshChatClientMetadata, signal: AbortSignal): Promise<AuthorizationState> {
    try {
      signal.throwIfAborted()
      const state = await this.authority.refresh(clientMetadataSchema.parse(metadata))
      signal.throwIfAborted()
      return state
    } catch {
      throw new RemoteError('gateway/internal', '无法确认 DSH 账号状态，请检查 DSH 服务。', {})
    }
  }
  @Remote({ mode: 'stream' })
  async *watchAuthorization(metadata: DshChatClientMetadata, signal: AbortSignal): AsyncIterable<AuthorizationState> {
    try { yield* this.authority.watch(clientMetadataSchema.parse(metadata), signal) }
    catch { throw new RemoteError('gateway/internal', '无法确认 DSH 账号状态，请检查 DSH 服务。', {}) }
  }

  private async websiteFence(metadata: DshChatClientMetadata, epoch: string, signal: AbortSignal): Promise<WebsiteSessionFence | null> {
    signal.throwIfAborted()
    const expectedEpoch = authorizationEpochSchema.parse(epoch)
    const state = await this.authority.refresh(clientMetadataSchema.parse(metadata))
    signal.throwIfAborted()
    const current = this.authority.getSnapshot()
    if (state.status !== 'authorized' || state.error !== null || !state.accountId
      || state.accountId.length > 512 || state.epoch !== expectedEpoch
      || current.status !== 'authorized' || current.error !== null
      || current.accountId !== state.accountId || current.epoch !== expectedEpoch) return null
    return { accountId: state.accountId, epoch: expectedEpoch }
  }

  @Remote
  async loadWebsiteSession(metadata: DshChatClientMetadata, epoch: string, signal: AbortSignal): Promise<WebsiteSession | null> {
    try {
      const fence = await this.websiteFence(metadata, epoch, signal)
      return fence ? await this.websiteSessions.load(fence, signal) : null
    } catch { throw new RemoteError('gateway/internal', '无法恢复 CHAT 登录，请重试。', {}) }
  }

  @Remote
  async saveWebsiteSession(metadata: DshChatClientMetadata, epoch: string, session: WebsiteSession, signal: AbortSignal): Promise<boolean> {
    try {
      const parsed = websiteSessionSchema.parse(session)
      const fence = await this.websiteFence(metadata, epoch, signal)
      return fence ? await this.websiteSessions.save(fence, parsed, signal) : false
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

declare module '@deepseek-ai/cordis' { interface Context { dshChat: DshChatController } }
