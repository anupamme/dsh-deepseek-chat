/** Development fixture only. Never imported by either production plugin entry. */
import { useSyncExternalStore, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MainPanelId, PanelInfo, UsePanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { DesktopBrowserBridge, DesktopBrowserReservation } from '@deepseek-ai/dsh-client-ui-sidebar-browser/types'
import { CHAT_PANEL, ModeController, type ModeAuthorization } from '../src/core/mode.js'
import { DshChatBrandName, DshChatBrandControl, DshChatChatPanel, DshChatChatNavigation, DshChatChatSettings, DshChatLeadingControls, useDshChat, type DshChatUIBridge, type DshChatViewState, type DshChatViewportRect } from '../src/ui.js'
import { DshChatWebSurface } from '../src/web-surface.js'
import { adaptWebsiteNavigation, emptyNavigation, parseWebsiteNavigation, type WebsiteCommand } from '../src/website-navigation.js'
import { createSidebarBinding } from '../src/sidebar-adapter.js'

const rootElement = document.getElementById('preview-root')!
type LedgerEntry = { sequence: number; action: string; lease?: string; storageKey?: string; url?: string }
const ledger: LedgerEntry[] = []
const partitions = new Map<string, string>()
const activeLeases = new Set<string>()
const popupListeners = new Map<string, (url: string) => void>()
const listeners = new Set<() => void>()
let leaseNumber = 0
let authorizationGeneration = 0
let epochNumber = 0
let sidebarMounted = false
let sidebarCollapsed = false
let websiteReloadRevision = 0
let websiteNavigationRefreshRequestId = 0
let websiteNavigationRefreshing = false
let websiteNavigationRefreshError: string | null = null
let webLoading = false
let webError: string | null = null
let websiteAuthenticationStatus: DshChatViewState['websiteAuthenticationStatus']='loading'
let websiteAuthenticationRevision=0
let websiteSignInRequested=false
let websiteSessionStatus: DshChatViewState['websiteSessionStatus']='idle'
let websiteSessionError: string | null = null
let fixtureAccountLabel='官网模拟账号 A'
let settingsOpen = false
let viewport: DshChatViewportRect | null = null
let brandAnchor: DshChatViewportRect | null = null
let sidebarAdapted: boolean | null = null
let websiteNavigation = emptyNavigation()
let showWebsiteNavigation = false
let navigationHandler: ((command: WebsiteCommand) => Promise<void>) | null = null
let fixtureWebsiteMode: 'ready' | 'empty' | 'sign-in' | 'unsupported' = 'ready'
let cached: DshChatViewState
let sidebar: ReturnType<typeof createSidebarBinding> | undefined
let panelInfo: PanelInfo = { activePanelId: 'harness.original' as MainPanelId }

function record(entry: Omit<LedgerEntry, 'sequence'>): void {
  ledger.push({ sequence: ledger.length + 1, ...entry })
  publish()
}

const layout = {
  panelInfo: {
    getSnapshot: () => panelInfo,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  },
  selectPanel(panel: string | null) {
    panelInfo = { activePanelId: panel as MainPanelId | null }
    controller.observePanel(panel)
    publish()
  },
  toggleSidebar() { sidebarCollapsed = !sidebarCollapsed; publish() },
}

const controller = new ModeController({
  readPanel: () => layout.panelInfo.getSnapshot().activePanelId,
  selectPanel: panel => layout.selectPanel(panel),
  mountChatNavigation: () => {
    sidebarMounted = true
    record({ action: 'mount-chat-sidebar' })
    return () => { sidebarMounted = false; record({ action: 'dispose-chat-sidebar' }) }
  },
  cancelAccount: accountId => {
    authorizationGeneration++
    webLoading = false
    webError = null
    websiteNavigationRefreshing = false
    websiteNavigationRefreshError = null
    websiteNavigation = emptyNavigation(); navigationHandler = null
    record({ action: `invalidate:${accountId}` })
  },
}, true)

const nativeBrowser: DesktopBrowserBridge = {
  async acquire(storageKey) {
    const lease = `preview-lease-${++leaseNumber}` as DesktopBrowserReservation['lease']
    if (!partitions.has(storageKey)) partitions.set(storageKey, `preview-partition-${partitions.size + 1}`)
    activeLeases.add(lease)
    record({ action: 'acquire', lease, storageKey })
    return { lease, partition: partitions.get(storageKey)! }
  },
  async release(lease) {
    activeLeases.delete(lease)
    popupListeners.delete(lease)
    record({ action: 'release', lease })
  },
  onOpenRequested(lease, listener) {
    popupListeners.set(lease, listener)
    return () => { popupListeners.delete(lease) }
  },
}

function publish(): void {
  const state = controller.getSnapshot()
  const authorized = state.authorization.status === 'authorized'
  cached = {
    mode: state.mode, modeEnabled: controller.canEnter(), authorizationStatus: state.authorization.status,
    availabilityMessage: authorized ? '开发模拟：CHAT 独立官网登录，模式切换不受 HARNESS 登录影响。网页容器不联网。' : '开发模拟：登录保存服务未连接，模式切换仍可用。',
    accountLabel: websiteNavigation.accountName ?? null,
    error: state.error ?? (state.authorization.error ? '开发模拟：登录保存服务暂时不可用，请重试连接。' : null), desktopAvailable: true, webLoading, webError, settingsOpen, preferenceError:null, viewport, brandAnchor, sidebarAdapted,
    accountStorageKey: authorized && state.authorization.accountId ? `preview:website:${state.authorization.accountId}` : null,
    authorizationGeneration, websiteReloadRevision, websiteNavigation, showWebsiteNavigation,
    websiteNavigationRefreshing, websiteNavigationRefreshError,
    websiteAuthenticationStatus,websiteAuthenticationRevision,websiteSessionStatus,websiteSessionError,
  }
  sidebar?.sync()
  for (const listener of listeners) listener()
}

function acceptAuthorization(next: ModeAuthorization): void {
  const previous = controller.getSnapshot().authorization
  if (next.accountId !== previous.accountId || next.epoch !== previous.epoch) authorizationGeneration++
  controller.updateAuthorization(next)
  publish()
}

function authorize(accountId: string): void {
  acceptAuthorization({ status: 'authorized', accountId, epoch: `preview-${++epochNumber}`, error: null })
}

function sameAccountRefresh(): void {
  acceptAuthorization({ ...controller.getSnapshot().authorization })
}

const bridge: DshChatUIBridge = {
  setSettingsOpen: open=>{if(settingsOpen===open)return;settingsOpen=open;publish()},
  logoutWebsite:()=>{
    fixtureWebsiteMode='sign-in';websiteSignInRequested=false;websiteAuthenticationRevision++
    websiteAuthenticationStatus='signed-out';websiteSessionStatus='idle';websiteSessionError=null
    websiteNavigationRefreshRequestId++;websiteNavigationRefreshing=false;websiteNavigationRefreshError=null
    websiteNavigation={...emptyNavigation(),status:'sign-in'};publish()
  },
  getSnapshot: () => cached,
  subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
  selectMode: mode => { controller.select(mode) },
  refreshAuthorization: () => {
    if (controller.getSnapshot().authorization.status === 'authorized') sameAccountRefresh()
    else authorize('preview-profile') // Only a local Host/profile capability; never website identity.
  },
  manageAccount: () => { bridge.beginWebsiteSignIn() },
  beginWebsiteSignIn: () => {
    controller.select('chat')
    if (!websiteSignInRequested) websiteAuthenticationRevision++
    websiteSignInRequested=true;websiteAuthenticationStatus='signing-in';websiteSessionError=null;publish()
  },
  loadWebsiteSession: async () => null,
  saveWebsiteSession: async () => false, // No real or simulated credential payload is persisted.
  clearWebsiteSession: async generation => {
    if (generation!==authorizationGeneration) return false
    websiteSessionStatus='idle';websiteSessionError=null;publish();return true
  },
  reportWebsiteSessionError: () => {}, // Capture returning null is expected in this credential-free fixture.
  toggleSidebar: () => layout.toggleSidebar(),
  attachViewport: element => { if (!element) { viewport = null; publish() } },
  updateViewport: next => {
    if (viewport?.left === next?.left && viewport?.top === next?.top && viewport?.width === next?.width && viewport?.height === next?.height) return
    viewport = next
    publish()
  },
  updateBrandAnchor: next => {
    if (brandAnchor?.left === next?.left && brandAnchor?.top === next?.top && brandAnchor?.width === next?.width && brandAnchor?.height === next?.height) return
    brandAnchor = next; publish()
  },
  reloadWebsite: () => { websiteReloadRevision++; publish() },
  refreshWebsiteNavigation: () => {
    if (!navigationHandler || cached.mode!=='chat' || !cached.modeEnabled || websiteNavigationRefreshing || webLoading
      || websiteAuthenticationStatus!=='signed-in' || websiteNavigation.status!=='ready' || websiteNavigation.settings?.pending) return
    const generation=authorizationGeneration
    const requestId=++websiteNavigationRefreshRequestId
    bridge.reportWebsiteNavigationRefresh(generation,{requestId,refreshing:true,error:null})
    void navigationHandler({type:'refresh',requestId,authenticationRevision:websiteAuthenticationRevision}).catch(()=>{
      bridge.reportWebsiteNavigationRefresh(generation,{requestId,refreshing:false,error:'模拟列表刷新未完成，请重试。'})
    })
  },
  reportWebsiteNavigationRefresh: (generation,state) => {
    if (generation!==authorizationGeneration || state.requestId!==websiteNavigationRefreshRequestId) return
    websiteNavigationRefreshing=state.refreshing;websiteNavigationRefreshError=state.error;publish()
  },
  attachSidebar: element => { sidebar?.attach(element) },
  reportWebsiteState: (generation, state) => {
    if (generation !== authorizationGeneration) return
    webLoading = state.loading
    webError = state.error
    publish()
  },
  reportWebsiteNavigation: (generation,value) => {
    if (generation!==authorizationGeneration) return
    const next=parseWebsiteNavigation(value)
    if (next.status==='sign-in') {
      if (websiteNavigation.authenticated) websiteAuthenticationRevision++
      websiteAuthenticationStatus=websiteSignInRequested ? 'signing-in' : 'signed-out'
    } else if (next.authenticated) {
      if (!websiteNavigation.authenticated || next.accountName!==websiteNavigation.accountName) websiteAuthenticationRevision++
      websiteAuthenticationStatus='signed-in';websiteSignInRequested=false
    } else if (next.status==='unsupported') websiteAuthenticationStatus='error'
    websiteNavigation=next;publish()
  },
  bindWebsiteNavigation: (generation, handler) => { navigationHandler = handler; return () => { if (navigationHandler === handler) navigationHandler = null } },
  commandWebsite: command => {
    if ((cached.mode !== 'chat' && !settingsOpen) || !cached.modeEnabled) return
    if (command.type==='settings-read' || command.type==='setting') {showWebsiteNavigation=false;publish()}
    void navigationHandler?.(command)
  },
  toggleWebsiteNavigation: () => { showWebsiteNavigation = !showWebsiteNavigation; publish() },
}
sidebar = createSidebarBinding(() => ({chat:cached.mode === 'chat',canCreate:cached.modeEnabled && websiteNavigation.canCreate}),
  () => bridge.commandWebsite({type:'new'}), ready => { if (sidebarAdapted !== ready) { sidebarAdapted = ready; publish() } })
controller.subscribe(publish)
authorize('preview-profile')
publish()

/** Only this development root gets a browser-tag simulation. No webpage is ever fetched. */
const simulatedGuests = new WeakSet<HTMLElement>()
function simulateGuest(element: HTMLElement): void {
  if (simulatedGuests.has(element)) return
  simulatedGuests.add(element)
  const lease = element.getAttribute('name') ?? 'unknown'
  let currentUrl = element.getAttribute('src') ?? 'about:blank'
  const load = async (url: string) => {
    currentUrl = url
    record({ action: 'loadURL', lease, url })
    const navigation = Object.assign(new Event('did-start-navigation'), {isMainFrame:true,isInPlace:false})
    element.dispatchEvent(navigation)
    element.dispatchEvent(new Event('did-start-loading'))
    await new Promise<void>(resolve => queueMicrotask(() => {
      if (element.isConnected) {
        element.dispatchEvent(new Event('dom-ready'))
        element.dispatchEvent(new Event('did-stop-loading'))
      }
      resolve()
    }))
  }
  const fixtureDoc = document.implementation.createHTMLDocument('navigation fixture')
  fixtureDoc.body.innerHTML = '<div class="fixture-grid"><div class="fixture-track"><aside><button>开启新对话</button><div>置顶</div><a href="/a/chat/s/fixture-a">模拟对话 A</a><div>昨天</div><a href="/a/chat/s/fixture-b">模拟对话 B</a><footer><img alt="fixture avatar"><button>官网模拟账号 A</button></footer></aside></div><main><div class="fixture-chrome"><button><svg/></button><button><svg/></button></div><textarea aria-label="fixture draft">fixture draft</textarea></main></div>'
  Object.assign(fixtureDoc.querySelector('aside')!, {getBoundingClientRect: () => ({width:280,height:600,left:0,top:0,right:280,bottom:600})})
  Object.assign(fixtureDoc.querySelector('.fixture-track')!, {getBoundingClientRect:()=>({width:280,height:600,left:0,top:0,right:280,bottom:600})})
  Object.assign(fixtureDoc.querySelector('.fixture-grid')!, {getBoundingClientRect:()=>({width:1100,height:600,left:0,top:0,right:1100,bottom:600})})
  Object.assign(fixtureDoc.querySelector('.fixture-chrome')!, {getBoundingClientRect:()=>({width:120,height:40,left:280,top:0,right:400,bottom:40})})
  Object.assign(fixtureDoc.querySelector('img')!, {getBoundingClientRect:()=>({width:20,height:20,left:10,top:560,right:30,bottom:580})})
  Object.assign(fixtureDoc.querySelector('footer')!, {getBoundingClientRect:()=>({width:280,height:40,left:0,top:550,right:280,bottom:590})})
  let fixtureLanguage='English'
  let fixtureTheme='System'
  fixtureDoc.querySelector('footer button')!.addEventListener('click',()=>{
    if(fixtureDoc.querySelector('[role=menu]')) return
    const menu=fixtureDoc.createElement('div');menu.setAttribute('role','menu');menu.innerHTML='<div class="ds-dropdown-menu-option">系统设置</div>'
    menu.querySelector('.ds-dropdown-menu-option')!.addEventListener('click',()=>{
      menu.remove()
      const dialog=fixtureDoc.createElement('div');dialog.setAttribute('role','dialog')
      dialog.innerHTML='<header>系统设置<button aria-label="close"><svg/></button></header><div class="ds-button">通用设置</div><div><span>Theme</span><div class="ds-button">Light</div><div class="ds-button">Dark</div><div class="ds-button">System</div></div><div><span>Language</span><div class="ds-select"><div><span></span><svg/></div></div></div>'
      dialog.querySelector('header button')!.addEventListener('click',()=>dialog.remove())
      dialog.querySelectorAll('.ds-button').forEach(btn=>{if(['Light','Dark','System'].includes(btn.textContent!)){btn.setAttribute('aria-pressed',String(btn.textContent===fixtureTheme));btn.addEventListener('click',()=>{fixtureTheme=btn.textContent!;dialog.querySelectorAll('.ds-button').forEach(el=>el.setAttribute('aria-pressed',String(el.textContent===fixtureTheme)))})}})
      const languageControl=dialog.querySelector('.ds-select span')!;languageControl.textContent=fixtureLanguage
      languageControl.addEventListener('pointerdown',()=>{
        const list=fixtureDoc.createElement('div');list.setAttribute('role','listbox')
        for(const value of ['English','简体中文','System']){const opt=fixtureDoc.createElement('button');opt.setAttribute('role','option');opt.textContent=value;opt.addEventListener('click',()=>{fixtureLanguage=value;languageControl.textContent=value;list.remove()});list.append(opt)}
        fixtureDoc.body.append(list)
      })
      fixtureDoc.body.append(dialog)
    });fixtureDoc.body.append(menu)
  })
  let fixturePath = '/a/chat/s/fixture-a'
  let fixtureNewCount = 0
  fixtureDoc.querySelector('button')!.addEventListener('click', () => { fixturePath = '/'; fixtureNewCount++ })
  fixtureDoc.querySelectorAll('a').forEach(link => link.addEventListener('click', event => { event.preventDefault(); fixturePath = link.getAttribute('href')! }))
  Object.assign(element, { loadURL: load, getURL: () => currentUrl, reload: () => { void load(currentUrl) }, executeJavaScript: async (code: string) => {
    // A fixed, content-free readiness result for this simulated guest only.
    if (code.includes('function websiteRefreshReadiness(')) return 'ready'
    const prefix = ')(document,location,'
    const commandStart=code.lastIndexOf(prefix)
    // Session scripts never execute against this fixture and never receive a grant.
    if (commandStart<0) return null
    const tail=code.slice(commandStart+prefix.length)
    const commandEnd=tail.lastIndexOf('); })()')
    if (commandEnd<0) return null
    const command = JSON.parse(tail.slice(0,commandEnd)) as WebsiteCommand
    fixtureDoc.querySelector('footer button')!.textContent=fixtureAccountLabel
    const history = fixtureDoc.querySelectorAll('a')
    history.forEach(link => { link.hidden = fixtureWebsiteMode === 'empty' })
    const savedLinks = [...history].map(link => link.getAttribute('href'))
    if (fixtureWebsiteMode === 'empty') history.forEach(link => link.removeAttribute('href'))
    const nav = fixtureDoc.querySelector('aside')!
    const newButton = nav.querySelector('button')!
    newButton.textContent = fixtureWebsiteMode === 'unsupported' ? 'Fixture layout changed' : '开启新对话'
    const result = adaptWebsiteNavigation(fixtureDoc, {origin:'https://chat.deepseek.com',pathname:fixtureWebsiteMode === 'sign-in' ? '/sign_in' : fixturePath}, command)
    history.forEach((link,index) => link.setAttribute('href',savedLinks[index]!))
    element.setAttribute('data-preview-original-navigation',fixtureDoc.getElementById('dsh-chat-website-navigation-style') ? 'hidden' : 'visible')
    element.setAttribute('data-preview-path',fixturePath)
    element.setAttribute('data-preview-track',fixtureDoc.querySelector('.fixture-track')!.hasAttribute('data-dsh-chat-navigation')?'hidden':'visible')
    element.setAttribute('data-preview-content',String(fixtureDoc.querySelector('main')!.hasAttribute('data-dsh-chat-content')))
    element.setAttribute('data-preview-chrome',String(fixtureDoc.querySelector('.fixture-chrome')!.hasAttribute('data-dsh-chat-web-chrome')))
    element.setAttribute('data-preview-language',fixtureLanguage)
    element.setAttribute('data-preview-theme',fixtureTheme)
    element.setAttribute('data-preview-dialog',String(!!fixtureDoc.querySelector('[role=dialog]')))

    element.setAttribute('data-preview-new-count',String(fixtureNewCount))
    return result
  } })
  const style = document.createElement('style')
  style.textContent = '.dsh-chat-webview:has([data-preview-guest]){display:flex;align-items:center;justify-content:center;background:#f8f9fc;color:#555d70;font-family:system-ui;text-align:center}[data-preview-guest] strong{font-size:20px;display:block;margin-bottom:12px}[data-preview-guest] p{font-size:13px;line-height:1.8;margin:0;max-width:430px}[data-preview-guest] code{font-size:11px;color:#8990a1}'
  const note = document.createElement('div')
  note.dataset.previewGuest = lease
  const title = document.createElement('strong')
  title.textContent = '网页容器模拟，未加载官网'
  const body = document.createElement('p')
  body.textContent = '这里只验证模式切换和网页容器生命周期。没有登录、聊天或官网历史；切回 HARNESS 后，同一个模拟配置下的容器保持不变。'
  const identity = document.createElement('code')
  identity.textContent = lease
  note.append(title, body, identity)
  element.append(style, note)
  queueMicrotask(() => { if (element.isConnected) element.dispatchEvent(new Event('dom-ready')) })
}
const guestObserver = new MutationObserver(records => {
  for (const record of records) for (const node of record.addedNodes) {
    if (!(node instanceof HTMLElement)) continue
    if (node.tagName === 'WEBVIEW') simulateGuest(node)
    for (const element of node.querySelectorAll<HTMLElement>('webview')) simulateGuest(element)
  }
})
// The production surface uses a body portal, outside preview-root.
guestObserver.observe(document.body, { childList: true, subtree: true })

const slotProps = {
  usePanelInfo: (<R,>(selector: (snapshot: PanelInfo) => R): R => selector(useSyncExternalStore(layout.panelInfo.subscribe, layout.panelInfo.getSnapshot))) as UsePanelInfo,
}

const previewStyles = `
  *{box-sizing:border-box}body{margin:0;background:#fff;color:#24262b;font:14px system-ui,sans-serif}
  button,textarea{font:inherit}button{cursor:pointer}button:disabled{cursor:default}button:focus-visible,textarea:focus-visible{outline:2px solid #3568e6;outline-offset:3px}
  .preview-page{height:100vh;display:flex;flex-direction:column;--dsw-specific-sidebar-fill:#f3f4f7;--dsw-alias-label-primary:#22252c;--dsw-alias-label-secondary:#717785;--dsw-alias-border-l2:#e1e4eb;--dsw-alias-bg-base:#fff;--dsw-alias-interactive-bg-hover:#e9edf4}
  .preview-header{background:#fff7db;border-bottom:1px solid #ede1b8;padding:12px 18px;flex-shrink:0}
  .preview-header h1{font-size:15px;margin:0 0 5px}.preview-header p{font-size:12px;margin:0;color:#756843}
  .preview-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.preview-actions button{padding:6px 9px;border:1px solid #ded4b9;border-radius:6px;background:white;font-size:12px}
  .preview-frame{display:flex;flex:1;min-height:0}.preview-sidebar-owner{flex:0 0 auto;min-width:0;height:100%}.preview-harness-sidebar{width:100%;height:100%;background:#f3f4f7;padding:20px 16px;display:flex;flex-direction:column;border-right:1px solid #e2e5ec}
  .preview-harness-sidebar h2{font-size:18px;margin:0 0 25px}.preview-harness-sidebar p{font-size:12px;line-height:1.6;color:#767b88}.preview-harness-sidebar nav{display:flex;flex-direction:column;gap:12px}.preview-footer{margin-top:auto}
  .preview-main{flex:1;min-width:0;min-height:0}.preview-original{height:100%;display:flex}.preview-conversation{padding:32px;flex:1;min-width:0}.preview-conversation h2{font-size:24px;margin:0 0 12px}.preview-conversation p{font-size:13px;line-height:1.8;color:#787d88}
  .preview-conversation textarea{width:100%;height:110px;padding:12px;border:1px solid #dfe3ea;border-radius:9px;resize:vertical}.preview-rightbar{width:240px;background:#fafbfc;padding:26px 18px;border-left:1px solid #e4e7ed}
  .preview-rightbar h3{font-size:13px;margin:0 0 12px}.preview-rightbar dl{font-size:12px;color:#727887}.preview-rightbar dd{margin:4px 0 15px;color:#252a35}
  .preview-settings{position:fixed;inset:20% 20%;z-index:60;background:#fff;border:1px solid #ddd;border-radius:16px;padding:20px;overflow:auto}.preview-leading{position:fixed;left:18px;top:150px;z-index:30;background:white}.preview-ledger{font-size:11px;line-height:1.65;color:#697182;overflow-wrap:anywhere}.preview-ledger strong{color:#252a35}.preview-ledger ol{padding-left:17px}.preview-ledger small{font-size:10px}
  @media(max-width:850px){.preview-rightbar{width:180px}.preview-harness-sidebar{width:250px}.preview-conversation{padding:20px}}
`

function Preview() {
  const [settingsOpen,setSettingsOpen]=useState(false)
  const state = useDshChat(bridge)
  const chat = state.mode === 'chat'
  const counts = { acquired: ledger.filter(item => item.action === 'acquire').length, released: ledger.filter(item => item.action === 'release').length }
  return <div className="preview-page">
    <style>{previewStyles}</style>
    <header className="preview-header">
      <h1>dsh-deepseek-chat 开发预览 · 模拟环境，不是 DSH 实机验收</h1>
      <p>复用插件实际 UI 和 ModeController；CHAT 官网账号、登录保存服务和网页容器分别模拟，不连接 DeepSeek 官网，也不创建任何授权记录。</p>
      <div className="preview-actions" aria-label="开发模拟控制"><button onClick={()=>setSettingsOpen(true)}>CHAT设置</button>
        <button type="button" onClick={() => acceptAuthorization({ status: 'pending', accountId: null, epoch: `preview-${++epochNumber}`, error: null })}>模拟保存服务待连接</button>
        <button type="button" onClick={() => acceptAuthorization({ status: 'unavailable', accountId: null, epoch: `preview-${++epochNumber}`, error: 'fixture-unavailable' })}>模拟保存服务中断</button>
        <button type="button" onClick={() => authorize('preview-profile')}>连接模拟保存服务</button>
        <button type="button" onClick={sameAccountRefresh} disabled={state.authorizationStatus !== 'authorized'}>刷新模拟保存服务</button>
        <button type="button" onClick={() => record({action:'fixture-harness-sign-out'})}>模拟退出 HARNESS（不影响 CHAT）</button>
        <button type="button" onClick={() => { fixtureAccountLabel='官网模拟账号 B';fixtureWebsiteMode='ready' }}>模拟官网账号 B</button>
        <button type="button" onClick={() => { fixtureWebsiteMode = 'sign-in' }}>模拟官网登录页</button>
        <button type="button" onClick={() => { fixtureWebsiteMode = 'empty' }}>模拟官网空列表</button>
        <button type="button" onClick={() => { fixtureWebsiteMode = 'unsupported' }}>模拟官网结构变化</button>
        <button type="button" onClick={() => { fixtureAccountLabel='官网模拟账号 A';fixtureWebsiteMode = 'ready' }}>模拟官网账号 A / 登录完成</button>
      </div>
    </header>
    <div className="preview-frame">
      {/* Official AppFrame constrains this occupant inside a fixed-width grid column. */}
      <div className="preview-sidebar-owner" style={{ width: sidebarCollapsed ? 56 : 270 }}>
      <aside className="preview-harness-sidebar" aria-label="共用原侧栏模拟外壳">
        <button type="button" onClick={() => layout.toggleSidebar()} aria-label="切换模拟侧栏折叠">☰</button>
        {/* Match rc.2's clipped 24px brand identity so visibility regressions are observable. */}
        <div data-window-drag style={{ display: 'flex', alignItems: 'center', height: 24, marginTop: 18, marginBottom: 34, overflow: 'hidden', flexShrink:0 }}>
          <span style={{ display:'inline-flex', flex:1, minWidth:0 }}><span aria-hidden="true" style={{ display:'inline-flex', alignItems:'center', gap:8, height:24, minWidth:0 }}><span><FishLogo size={24} /></span><span style={{display:'inline-flex', minWidth:0}}><div data-slot="sidebar.brand.name" style={{display:'contents'}}>{!sidebarCollapsed && <DshChatBrandName {...slotProps} bridge={bridge} />}</div></span></span></span>
        </div>
        <button type="button" aria-label="新建会话" onClick={() => { record({action:'harness-new-session'}); layout.selectPanel('harness.original') }}>新会话</button>
        <nav aria-label="全局面板"><button type="button" aria-label="插件" onClick={() => layout.selectPanel('plugins')}>插件</button></nav>
        <div style={{flex:1,minHeight:0,marginTop:20}}>{sidebarMounted ? <DshChatChatNavigation {...slotProps} bridge={bridge} wide={!sidebarCollapsed} expandSidebar={() => layout.toggleSidebar()} /> : <nav aria-label="原 Harness 模拟导航"><strong>原工作区</strong><span>原会话与文件面板</span></nav>}</div>
        {!sidebarCollapsed && <div className="preview-ledger" aria-label="网页容器生命周期">
          <strong>状态：{state.mode.toUpperCase()} / {state.authorizationStatus}</strong><br />
          <span>保存服务代次：{state.authorizationGeneration} · 官网状态：{state.websiteAuthenticationStatus}</span><br />
          <span>创建 {counts.acquired} · 释放 {counts.released} · 当前 {activeLeases.size}</span>
          <ol>{ledger.slice(-5).map(item => <li key={item.sequence}>{item.action} <small>{item.lease}</small></li>)}</ol>
        </div>}
        <div className="preview-footer">{sidebarCollapsed ? 'A' : '原账号和设置'}</div>
      </aside>
      </div>
      <main className="preview-main">
        <div className="preview-original" style={{ display: chat ? 'none' : 'flex' }} data-preview-original="harness">
          <section className="preview-conversation" aria-label="原 Harness 模拟面板">
            <h2>原 Harness 工作区</h2>
            <p>原面板 ID：<code>{panelInfo.activePanelId ?? 'conversation'}</code><br />切入 CHAT 前的面板会由真正的模式控制器记录并恢复。</p>
            <label htmlFor="harness-draft">Harness 草稿（模拟，可修改后切换检验保留）</label>
            <textarea id="harness-draft" defaultValue="这是原 Harness 的草稿，切换模式后应保留。" />
            <p>此预览不能验证 DSH 加载、官网登录、聊天、真实历史、系统快捷键或原生右栏。</p>
          </section>
          <aside className="preview-rightbar" aria-label="原 Harness 模拟右栏"><h3>原右栏状态</h3><dl><dt>是否展开</dt><dd>展开</dd><dt>宽度</dt><dd>240 px</dd><dt>已选标签</dt><dd>原文件预览</dd><dt>展示模式</dt><dd>普通</dd></dl><p>CHAT 隐藏该模拟栏，HARNESS 恢复相同状态。</p></aside>
        </div>
        {chat && <DshChatChatPanel {...slotProps} bridge={bridge} />}
      </main>
    </div>
    {chat && sidebarCollapsed && <div className="preview-leading"><DshChatLeadingControls {...slotProps} bridge={bridge}/></div>}
    {settingsOpen && <div className="preview-settings" role="dialog" aria-label="模拟DSH设置"><button onClick={()=>setSettingsOpen(false)}>关闭设置</button><DshChatChatSettings {...slotProps} bridge={bridge} close={()=>setSettingsOpen(false)}/></div>}
    <DshChatBrandControl {...slotProps} bridge={bridge} />
    <DshChatWebSurface {...slotProps} bridge={bridge} nativeBrowser={nativeBrowser} />
  </div>
}

/** Public, credential-free inspection hook for development browser assertions. */
Object.assign(window, { __DSH_CHAT_PREVIEW__: {
  getSnapshot: () => ({ ...cached, activePanelId: panelInfo.activePanelId, sidebarMounted, sidebarCollapsed }),
  getLedger: () => ledger.map(entry => ({ ...entry })),
  getActiveLeases: () => [...activeLeases],
  controller,
} })
createRoot(rootElement).render(<Preview />)
