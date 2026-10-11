import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { DesktopBrowserBridge } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import { CHAT_PANEL, ModeController } from './core/mode.js'
import { authorizationSchema, DSH_CHAT_REMOTE_CONTRIBUTION } from './protocol.js'
import type { AuthorizationState, DshChatClientMetadata, WebsiteSession } from './protocol.js'
import { DshChatBrandName, DshChatBrandControl, DshChatChatNavigation, DshChatChatPanel, DshChatLeadingControls, DshChatChatSettings } from './ui.js'
import type { DshChatUIBridge, DshChatViewState, DshChatViewportRect } from './ui.js'
import { DshChatWebSurface } from './web-surface.js'
import { emptyNavigation, parseWebsiteNavigation, type WebsiteCommand } from './website-navigation.js'
import { createSidebarBinding } from './sidebar-adapter.js'

export const name = 'dsh-chat'
export const inject = ['slots', 'layout', 'remote']
const AUTHORIZATION_TIMEOUT_MS = 35_000
const DEFAULT_WEBSITE_LANGUAGE = 'zh-CN'

function desktopBrowser(): DesktopBrowserBridge | undefined {
  const desktop = (globalThis as typeof globalThis & {
    dshDesktop?: { protocolVersion?: number; browser?: DesktopBrowserBridge }
  }).dshDesktop
  if (desktop?.protocolVersion !== 1) return undefined
  const browser = desktop.browser
  return browser && typeof browser.acquire === 'function' && typeof browser.release === 'function'
    && typeof browser.onOpenRequested === 'function' ? browser : undefined
}

export function apply(ctx: Context): void {
  const nativeBrowser = desktopBrowser()
  const lifetime = new AbortController()
  const listeners = new Set<() => void>()
  let disposed = false
  let remoteContext: Context | null = null
  let connecting: Promise<void> | null = null
  let refreshing: Promise<void> | null = null
  let authorizationGeneration = 0
  let websiteReloadRevision = 0
  let webLoading = false
  let webError: string | null = null
  let connectionError: string | null = null
  let navigationAttempt = 0
  let settingsViewport: DshChatViewportRect | null = null
  let settingsReadRequested=false
  let preferenceError: string | null = null
  let preferences: {language:string} | null = null
  let preferenceForm: import('@deepseek-ai/dsh-client-ui-settings/client').ConfigForm<{language:string}> | null = null
  let preferencesGeneration = -1
  let restoringPreferences = false
  let restorationSeen = false
  let websiteSignedOut = false
  let logoutRequested = false
  let forgettingWebsiteSession = false
  let logoutTimer: ReturnType<typeof setTimeout> | undefined
  let websiteHadSession = false
  let websiteSessionStatus: DshChatViewState['websiteSessionStatus'] = 'idle'
  let websiteSessionError: string | null = null
  let pendingSessionSave: Promise<boolean> | null = null
  const pendingPreferences = new Map<string,string>()
  let viewport: DshChatViewportRect | null = null
  let brandAnchor: DshChatViewportRect | null = null
  let sidebarAdapted: boolean | null = null
  let websiteNavigation = emptyNavigation()
  let showWebsiteNavigation = false
  let navigationHandler: ((command: WebsiteCommand) => Promise<void>) | null = null
  let bridge: DshChatUIBridge
  let cached: DshChatViewState
  let sidebar: ReturnType<typeof createSidebarBinding> | undefined
  const mode = new ModeController({
    readPanel: () => ctx.layout.panelInfo.getSnapshot().activePanelId,
    selectPanel: panel => { ctx.layout.selectPanel(panel as MainPanelId | null) },
    mountChatNavigation: () => {
      const navigation = ctx.slots.inject('sidebar.workspaces', () => ctx.slots.register({ name: 'sidebar.workspaces', priority: -100, inject: () => ({ bridge }) }, DshChatChatNavigation))
      const leading = ctx.slots.inject('shell.leading', () => ctx.slots.register({name:'shell.leading',priority:-100,inject:()=>({bridge})}, DshChatLeadingControls))
      return () => { leading(); navigation() }
    },
    cancelAccount: () => { authorizationGeneration++; webLoading = false; webError = null; websiteNavigation = emptyNavigation(); navigationHandler = null; publish() },
  }, Boolean(nativeBrowser))
  function availability(): string {
    const state = mode.getSnapshot()
    if (!nativeBrowser) return '网页嵌入目前需要 DSH 桌面版 0.2.0-rc.2 的官方浏览器能力。'
    if (state.authorization.status === 'pending') return '正在确认 DSH 的 DeepSeek 账号授权。'
    if (state.authorization.status === 'unauthorized') return '请先在 Harness 中登录并授权 DeepSeek 账号，确认后即可使用 CHAT。'
    if (state.authorization.status === 'unavailable') return '暂时无法确认 DSH 账号授权，请检查网络后刷新。'
    if (websiteSignedOut) return '官网已退出，请在 CHAT设置中重新登录。'
    return '真实 DeepSeek 网页；网页登录与 DSH 授权分别处理。'
  }
  function publish(): void {
    if (disposed) return
    const state = mode.getSnapshot()
    cached = {
      mode: state.mode, modeEnabled: mode.canEnter() && !websiteSignedOut, authorizationStatus: state.authorization.status,
      availabilityMessage: availability(), accountLabel: state.authorization.status === 'authorized' ? 'DSH 账号已授权' : null,
      error: state.error ?? connectionError ?? (state.authorization.error ? 'DSH 账号状态刷新遇到网络或服务问题。' : null),
      desktopAvailable: Boolean(nativeBrowser), webLoading, webError, settingsViewport, preferenceError, viewport, brandAnchor, sidebarAdapted,
      websiteSessionStatus, websiteSessionError,
      accountStorageKey: state.authorization.status === 'authorized' && state.authorization.accountId
        ? `dsh-chat:website:${state.authorization.accountId}` : null,
      authorizationGeneration, websiteReloadRevision, websiteNavigation, showWebsiteNavigation,
    }
    sidebar?.sync()
    for (const listener of listeners) listener()
  }
  function acceptAuthorization(value: AuthorizationState): void {
    const next = authorizationSchema.parse(value)
    const previous = mode.getSnapshot().authorization
    if (next.accountId !== previous.accountId || next.epoch !== previous.epoch) {
      authorizationGeneration++; websiteNavigation = emptyNavigation(); navigationHandler = null; showWebsiteNavigation = false;websiteSignedOut=false;logoutRequested=false;websiteHadSession=false;preferencesGeneration=-1
      websiteSessionStatus='idle';websiteSessionError=null
      forgettingWebsiteSession=false
      clearTimeout(logoutTimer);logoutTimer=undefined
    }
    connectionError = null
    mode.updateAuthorization(next)
    publish()
  }
  const metadata: DshChatClientMetadata = {
    version: '0.2.0-rc.2', locale: globalThis.navigator?.language ?? 'zh-CN',
    timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60,
  }
  function authorizationFailed(message: string): void {
    if (disposed) return
    connectionError = message
    const previous = mode.getSnapshot().authorization
    // A transport failure cannot revoke an already confirmed account or imply sign-out.
    if (previous.status === 'pending') mode.updateAuthorization({ ...previous, status: 'unavailable' })
    publish()
  }
  async function connectRemote(): Promise<void> {
    if (remoteContext || disposed) return
    if (!connecting) {
      connecting = Promise.resolve(ctx.effect(async () => {
        const unmount = await ctx.remote.$mount(DSH_CHAT_REMOTE_CONTRIBUTION)
        if (disposed) { await unmount(); return () => {} }
        // $mount publishes a separate Cordis service. Inject it only after
        // mounting, and call its methods from this dependency-aware Context.
        const consumer = ctx.inject(['remote', 'remote.dshChat'], remoteCtx => {
          remoteCtx.effect(() => {
            remoteContext = remoteCtx
            const stream = remoteCtx.remote.$stream<AuthorizationState>({
              name: 'dsh-chat.authorization', open: signal => remoteCtx.remote.dshChat.watchAuthorization(metadata, signal),
              ended: () => new Error('DSH account stream ended'),
              carrierFailed: () => { authorizationFailed('DSH 账号连接暂时中断，请刷新授权。') },
            })
            void (async () => {
              try {
                for await (const item of stream) {
                  if (disposed || remoteContext !== remoteCtx) break
                  if (item.signal.aborted) continue
                  acceptAuthorization(item.value); item.accept()
                }
              } catch { if (remoteContext === remoteCtx) authorizationFailed('DSH 账号状态通知不可用，请刷新授权。') }
            })()
            return () => {
              if (remoteContext === remoteCtx) remoteContext = null
              return stream.dispose()
            }
          }, 'dsh-chat account observation')
        })
        try { await consumer }
        catch (error) { await consumer.dispose(); await unmount(); throw error }
        return async () => { await consumer.dispose(); await unmount() }
      }, 'dsh-chat safe account remote')).then(() => {}).finally(() => { connecting = null })
    }
    await connecting
  }
  function refreshAuthorization(): Promise<void> {
    if (disposed) return Promise.resolve()
    if (refreshing) return refreshing
    refreshing = (async () => {
      const requestGeneration = authorizationGeneration
      const request = new AbortController()
      const cancel = () => { request.abort() }
      lifetime.signal.addEventListener('abort', cancel, { once: true })
      let timedOut = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { timedOut = true; request.abort(); reject(new Error('Authorization deadline exceeded')) }, AUTHORIZATION_TIMEOUT_MS)
        request.signal.addEventListener('abort', () => { reject(new Error('Authorization request cancelled')) }, { once: true })
      })
      try {
        const result = await Promise.race([
          (async () => {
            await connectRemote()
            if (request.signal.aborted || !remoteContext) throw new Error('Account remote unavailable')
            return remoteContext.remote.dshChat.authorization(metadata, request.signal)
          })(), deadline,
        ])
        if (disposed || request.signal.aborted || requestGeneration !== authorizationGeneration) return
        if (result.ok) acceptAuthorization(result.value)
        else authorizationFailed('无法连接 DSH 账号服务，请刷新授权重试。')
      } catch {
        if (!disposed && (requestGeneration === authorizationGeneration || mode.getSnapshot().authorization.status === 'pending')) authorizationFailed(timedOut
          ? 'DSH 账号授权检查超时，请检查网络后刷新授权。' : '无法连接 DSH 账号服务，请刷新授权重试。')
      } finally {
        clearTimeout(timer)
        lifetime.signal.removeEventListener('abort', cancel)
      }
    })().finally(() => { refreshing = null })
    return refreshing
  }
  // Authorization records travel only between our guest and the Host vault.
  // They never enter the published UI snapshot, settings, console or error text.
  function sessionFence(generation: number): { accountId: string; epoch: string } | null {
    const current=mode.getSnapshot().authorization
    return !disposed && generation===authorizationGeneration && current.status==='authorized' && current.accountId
      ? {accountId:current.accountId,epoch:current.epoch} : null
  }
  function sameSessionFence(generation: number, fence: {accountId:string;epoch:string}): boolean {
    const current=sessionFence(generation)
    return current!==null && current.accountId===fence.accountId && current.epoch===fence.epoch
  }
  function sessionFailure(code: string='unknown'): void {
    websiteSessionStatus='error'
    // Only fixed carrier codes choose a product message. Never display error details.
    if(code==='gateway/invocation-unavailable' || code==='gateway/definition-unavailable' || code==='gateway/method-unavailable') {
      websiteSessionError='网页登录保存服务尚未更新，请重启 DSH 完成插件升级。'
    } else if(code==='fence') {
      websiteSessionError='DSH 账号状态暂未确认，无法保存网页登录，请重试授权检查。'
    } else {
      websiteSessionError='网页登录状态未能保存或恢复，请重试；当前网页仍可正常使用。'
    }
    publish()
  }
  async function websiteRequest<T>(operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const request=new AbortController()
    const cancel=()=>request.abort()
    lifetime.signal.addEventListener('abort',cancel,{once:true})
    if(lifetime.signal.aborted) request.abort()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([operation(request.signal),new Promise<never>((_resolve,reject)=>{
        const abort=()=>reject(new Error('Website session request cancelled'))
        request.signal.addEventListener('abort',abort,{once:true})
        if(request.signal.aborted) abort()
        timer=setTimeout(()=>request.abort(),12_000)
      })])
    } finally {clearTimeout(timer);lifetime.signal.removeEventListener('abort',cancel);request.abort()}
  }
  async function clearWebsiteSession(generation: number): Promise<boolean> {
    const fence=sessionFence(generation)
    if(!fence) return false
    try {
      // Explicit logout sets its flag first, so no new save can pass this barrier.
      if(pendingSessionSave) await pendingSessionSave
      const result=await websiteRequest(async signal=>{
        await connectRemote()
        if(!remoteContext || signal.aborted || !sameSessionFence(generation,fence)) throw new Error('Website session invalidated')
        return remoteContext.remote.dshChat.clearWebsiteSession(metadata,fence.epoch,signal)
      })
      if(!sameSessionFence(generation,fence)) return false
      if(!result.ok){sessionFailure(result.error.code);return false}
      if(!result.value){sessionFailure('fence');return false}
      websiteSessionStatus='idle';websiteSessionError=null;publish();return true
    } catch {if(sameSessionFence(generation,fence)) sessionFailure();return false}
  }
  bridge = {
    getSnapshot: () => cached,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    selectMode: selected => {
      const attempt = ++navigationAttempt
      if (selected === 'harness') { mode.select('harness'); return }
      if (websiteSignedOut) return
      const requestedAccount = mode.getSnapshot().authorization
      void refreshAuthorization().then(() => {
        const currentAccount = mode.getSnapshot().authorization
        if (!disposed && attempt === navigationAttempt && currentAccount.accountId === requestedAccount.accountId
          && currentAccount.epoch === requestedAccount.epoch) mode.select('chat')
      })
    },
    refreshAuthorization: () => { void refreshAuthorization() },
    manageAccount: () => { mode.select('harness') },
    toggleSidebar: () => { ctx.layout.toggleSidebar() },
    attachViewport: element => { if (!element) { viewport = null; publish() } },
    updateViewport: next => {
      if (viewport?.left === next?.left && viewport?.top === next?.top && viewport?.width === next?.width && viewport?.height === next?.height) return
      viewport = next; publish()
    },
    updateBrandAnchor: next => {
      if (brandAnchor?.left === next?.left && brandAnchor?.top === next?.top && brandAnchor?.width === next?.width && brandAnchor?.height === next?.height) return
      brandAnchor = next; publish()
    },
    attachSidebar: element => { sidebar?.attach(element) },
    reportWebsiteState: (generation, state) => {
      if (disposed || generation !== authorizationGeneration) return
      webLoading = state.loading; webError = state.error; publish()
    },
    reloadWebsite: () => { websiteReloadRevision++; publish() },
    reportWebsiteNavigation: (generation, value, newDocument = false) => {
      if (disposed || generation !== authorizationGeneration) return
      try { websiteNavigation = parseWebsiteNavigation(value) } catch { websiteNavigation = { ...emptyNavigation(), status: 'unsupported' } }
      // Only confirmed document changes or sign-in reset the guest's preferences.
      // Temporary loading snapshots must not restart language/appearance restoration.
      if (newDocument === true || websiteNavigation.status === 'sign-in') {
        preferencesGeneration = -1; restoringPreferences = false; restorationSeen = false
      }
      if ((logoutRequested || websiteHadSession) && websiteNavigation.status === 'sign-in') { clearTimeout(logoutTimer);logoutTimer=undefined;logoutRequested=false;forgettingWebsiteSession=false;websiteHadSession=false;websiteSignedOut=true;mode.select('harness') }
      if (websiteNavigation.status === 'ready') { websiteHadSession=true;websiteSignedOut=false }
      if(logoutRequested && logoutTimer!==undefined && websiteNavigation.settings?.error && !websiteNavigation.settings.pending) {
        clearTimeout(logoutTimer);logoutTimer=undefined
        logoutRequested=false
        websiteSessionError='官网退出未完成，请重试。此设备已清除登录记忆。'
        websiteSessionStatus='error'
      }
      restorePreferences()
      readSettingsWhenReady()
      const settings = websiteNavigation.settings
      if (restoringPreferences && settings?.restored===false) restorationSeen=true
      if (restorationSeen && settings?.restored && !settings.pending) restoringPreferences=false
      if (!restoringPreferences && settings?.restored && !settings.pending && !settings.error) {
        const language=/中文|Chinese/i.test(settings.language ?? '') ? 'zh-CN' : /English|英语/i.test(settings.language ?? '') ? 'en' : /^(System|跟随系统|系统|Follow system)$/i.test(settings.language ?? '') ? 'system' : ''
        if (language) persistPreference('language',language)
      }
      publish()
    },
    bindWebsiteNavigation: (generation, handler) => {
      if (generation !== authorizationGeneration) return () => {}
      navigationHandler = handler
      restorePreferences()
      readSettingsWhenReady()
      return () => { if (navigationHandler === handler) navigationHandler = null }
    },
    commandWebsite: command => {
      if (disposed || (mode.getSnapshot().mode !== 'chat' && !settingsViewport) || !mode.canEnter() || !navigationHandler) return
      if (command.type === 'open' && !websiteNavigation.conversations.some(item => item.href === command.href)) return
      // Native settings needs the adapter's multi-step command to stay active;
      // restoring the original navigation would cancel it at the next poll.
      if (command.type==='settings-read' || command.type==='setting' || command.type==='preferences' || command.type==='logout') {
        showWebsiteNavigation=false; publish()
      }
      void navigationHandler(command)
    },
    toggleWebsiteNavigation: () => { showWebsiteNavigation = !showWebsiteNavigation; publish() },
    updateSettingsViewport: next => {
      if (settingsViewport?.left===next?.left && settingsViewport?.top===next?.top && settingsViewport?.width===next?.width && settingsViewport?.height===next?.height) return
      const opening = !settingsViewport && !!next
      if(opening) settingsReadRequested=false
      settingsViewport=next;publish()
      if(!next && navigationHandler) void navigationHandler({type:'settings-close'})
      else readSettingsWhenReady()
    },
    logoutWebsite: () => {
      if(logoutRequested || !navigationHandler || websiteNavigation.status!=='ready') return
      const generation=authorizationGeneration
      clearTimeout(logoutTimer);logoutTimer=undefined
      logoutRequested=true;forgettingWebsiteSession=true
      void clearWebsiteSession(generation).then(cleared=>{
        if(disposed || generation!==authorizationGeneration) return
        if(cleared) {
          bridge.commandWebsite({type:'logout'})
          logoutTimer=setTimeout(()=>{
            logoutTimer=undefined
            if(disposed || generation!==authorizationGeneration || !logoutRequested) return
            logoutRequested=false;websiteSessionStatus='error'
            websiteSessionError='官网退出未完成，请重试。此设备已清除登录记忆。';publish()
          },20_000)
        }
        else {logoutRequested=false;websiteSessionError='无法清除已保存的网页登录，请重试退出登录。';publish()}
      })
    },
    loadWebsiteSession: async generation => {
      const fence=sessionFence(generation)
      if(!fence || logoutRequested || forgettingWebsiteSession || websiteSignedOut) return null
      try {
        const result=await websiteRequest(async signal=>{
          await connectRemote()
          if(!remoteContext || signal.aborted || !sameSessionFence(generation,fence)) throw new Error('Website session invalidated')
          return remoteContext.remote.dshChat.loadWebsiteSession(metadata,fence.epoch,signal)
        })
        if(!sameSessionFence(generation,fence) || logoutRequested || forgettingWebsiteSession || websiteSignedOut) return null
        if(!result.ok){sessionFailure(result.error.code);return null}
        return result.value
      } catch {if(sameSessionFence(generation,fence)) sessionFailure();return null}
    },
    saveWebsiteSession: (generation,session) => {
      const fence=sessionFence(generation)
      if(!fence || logoutRequested || forgettingWebsiteSession || websiteSignedOut) return Promise.resolve(false)
      const saving=(async()=>{try {
        const result=await websiteRequest(async signal=>{
          await connectRemote()
          if(!remoteContext || signal.aborted || !sameSessionFence(generation,fence) || logoutRequested || forgettingWebsiteSession) throw new Error('Website session invalidated')
          return remoteContext.remote.dshChat.saveWebsiteSession(metadata,fence.epoch,session,signal)
        })
        if(!sameSessionFence(generation,fence) || logoutRequested || forgettingWebsiteSession || websiteSignedOut) return false
        if(!result.ok){sessionFailure(result.error.code);return false}
        if(!result.value){sessionFailure('fence');return false}
        websiteSessionStatus='saved';websiteSessionError=null;publish();return true
      } catch {if(sameSessionFence(generation,fence)) sessionFailure();return false}})()
      pendingSessionSave=saving
      void saving.finally(()=>{if(pendingSessionSave===saving) pendingSessionSave=null})
      return saving
    },
    clearWebsiteSession,
    reportWebsiteSessionError: (generation,message) => {
      if(!sessionFence(generation)) return
      if(websiteSessionStatus==='error' && websiteSessionError===message) return
      websiteSessionStatus='error';websiteSessionError=message;publish()
    },
  }
  function readSettingsWhenReady(): void {
    if(!settingsViewport || !navigationHandler || websiteNavigation.status!=='ready' || settingsReadRequested) return
    settingsReadRequested=true
    void navigationHandler({type:'settings-read'})
  }
  function restorePreferences(): void {
    if (!preferences || !navigationHandler || websiteNavigation.status!=='ready' || preferencesGeneration===authorizationGeneration) return
    const language = preferences.language || DEFAULT_WEBSITE_LANGUAGE
    preferencesGeneration=authorizationGeneration;restoringPreferences=true;restorationSeen=false
    void navigationHandler({type:'preferences',language})
  }
  function persistPreference(key:'language', value:string): void {
    if (!preferenceForm || !preferences || preferences[key]===value || pendingPreferences.get(key)===value) return
    pendingPreferences.set(key,value)
    void preferenceForm.set(key,value).then(accepted=>{if(!accepted) throw new Error('refused');preferenceError=null},()=>{preferenceError='CHAT偏好未能保存，请检查DSH设置连接。'}).catch(()=>{preferenceError='CHAT偏好未能保存，请检查DSH设置连接。'}).finally(()=>{if(pendingPreferences.get(key)===value) pendingPreferences.delete(key);publish()})
  }
  ctx.inject(['configForms'], child => {
    child.effect(() => {
      const form=child.configForms.get<{language:string}>('dsh-chat')
      preferenceForm=form
      const read=()=>{
        const snapshot=form.getSnapshot()
        if(snapshot.status==='ready' && snapshot.value){preferences=snapshot.value;preferenceError=snapshot.writable===false ? '当前DSH连接不能持久保存CHAT偏好。' : null;restorePreferences()}
        else if(snapshot.status==='unavailable') preferenceError='DSH未提供CHAT偏好配置，当前修改不能跨重启保存。'
        publish()
      }
      const stop=form.subscribe(read);read()
      return ()=>{stop();preferenceForm=null;preferences=null}
    })
  })
  sidebar = createSidebarBinding(() => {
    const state = mode.getSnapshot()
    return { chat: state.mode === 'chat', canCreate: mode.canEnter() && websiteNavigation.canCreate }
  }, () => bridge.commandWebsite({ type: 'new' }), ready => {
    if (sidebarAdapted !== ready) { sidebarAdapted = ready; publish() }
  })
  publish()
  // The enclosing effect's final cleanup restores navigation before registered main keys disappear.
  ctx.effect(() => {
    ctx.slots.inject('settings.section', () => ctx.slots.register({name:'settings.section',id:'dsh-chat.chat-settings',order:80,label:'CHAT设置',inject:()=>({bridge})}, DshChatChatSettings))
    ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: CHAT_PANEL, inject: () => ({ bridge }) }, DshChatChatPanel))
    ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -100, inject: () => ({ bridge }) }, DshChatBrandName))
    ctx.slots.inject('shell.overlay', () => [
      ctx.slots.register({ name: 'shell.overlay', id: 'dsh-chat.brand-control', order: 100, inject: () => ({ bridge }) }, DshChatBrandControl),
      ctx.slots.register({ name: 'shell.overlay', id: 'dsh-chat.website', order: 90, inject: () => ({ bridge, nativeBrowser }) }, DshChatWebSurface),
    ])
    const stopMode = mode.subscribe(publish)
    const stopPanel = ctx.layout.panelInfo.subscribe(() => { mode.observePanel(ctx.layout.panelInfo.getSnapshot().activePanelId) })
    const refreshOnFocus = () => { void refreshAuthorization() }
    globalThis.addEventListener('focus', refreshOnFocus)
    void refreshAuthorization()
    return () => {
      navigationAttempt++
      clearTimeout(logoutTimer)
      mode.dispose(); sidebar?.dispose(); stopPanel(); stopMode(); disposed = true; lifetime.abort(); listeners.clear()
      globalThis.removeEventListener('focus', refreshOnFocus)
    }
  }, 'dsh-chat reversible website UI')
}
