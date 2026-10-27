export interface WindowDragRegion { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
export interface WindowDragGeometry { readonly width: number; readonly height: number; readonly regions: readonly WindowDragRegion[] }

export interface WindowDragTrackerTimers {
  setTimeout(callback: () => void, delayMs: number): unknown
  clearTimeout(handle: unknown): void
}
export interface WindowDragTrackerOptions {
  /** Return parsed, safe full-height gaps, or [] when the surface is not safe. */
  read(): readonly WindowDragRegion[] | PromiseLike<readonly WindowDragRegion[]>
  onChange(regions: readonly WindowDragRegion[]): void
  readonly intervalMs?: number
  readonly timeoutMs?: number
  readonly timers?: WindowDragTrackerTimers
}
export interface WindowDragTracker {
  start(): void
  /** Fence an in-flight result and coalesce a fresh read, without clearing the last geometry. */
  refresh(): void
  dispose(): void
}

/** A deadline belongs to the current read, never to an already successful geometry sample. */
export function createWindowDragTracker(options: WindowDragTrackerOptions): WindowDragTracker {
  const timers: WindowDragTrackerTimers = options.timers ?? {
    setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimeout: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
  }
  const delay = (value: number | undefined, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
  const intervalMs = delay(options.intervalMs, 200), timeoutMs = delay(options.timeoutMs, 500)
  type Timer = { readonly handle: unknown }
  type Sample = { readonly epoch: number; timedOut: boolean; timer?: Timer }
  let started = false, disposed = false, epoch = 0, refreshQueued = false
  let nextTimer: Timer | undefined, pending: Sample | undefined
  let published: readonly WindowDragRegion[] = []
  const cancel = (timer: Timer | undefined) => { if (timer) timers.clearTimeout(timer.handle) }
  const publish = (regions: readonly WindowDragRegion[]) => {
    if (regions.length === published.length && regions.every((region, index) => {
      const previous = published[index]
      return region.left === previous.left && region.top === previous.top && region.width === previous.width && region.height === previous.height
    })) return
    // Keep our comparison independent of arrays/objects reused by the reader.
    published = regions.map(region => ({ left: region.left, top: region.top, width: region.width, height: region.height }))
    options.onChange(published)
  }
  const scheduleNext = () => {
    if (!started || disposed || pending || nextTimer) return
    if (refreshQueued) { sample(); return }
    nextTimer = { handle: timers.setTimeout(() => { nextTimer = undefined; sample() }, intervalMs) }
  }
  const finish = (request: Sample, regions: readonly WindowDragRegion[]) => {
    if (pending !== request) return
    cancel(request.timer); request.timer = undefined; pending = undefined
    try {
      if (!disposed && request.epoch === epoch && !request.timedOut) publish(regions)
    } finally { scheduleNext() }
  }
  const sample = () => {
    if (!started || disposed || pending) return
    cancel(nextTimer); nextTimer = undefined; refreshQueued = false
    const request: Sample = { epoch, timedOut: false }
    pending = request
    request.timer = { handle: timers.setTimeout(() => {
      request.timer = undefined
      if (disposed || pending !== request) return
      request.timedOut = true
      publish([])
      // A deadline cannot cancel the underlying guest call. Keep it in flight
      // until it settles; refresh storms must not accumulate concurrent calls.
    }, timeoutMs) }
    try {
      void Promise.resolve(options.read()).then(regions => finish(request, regions), () => finish(request, []))
    } catch { finish(request, []) }
  }
  return {
    start() {
      if (started || disposed) return
      started = true; sample()
    },
    refresh() {
      if (disposed) return
      epoch++
      if (!started) return
      cancel(nextTimer); nextTimer = undefined; refreshQueued = true
      if (!pending) sample()
    },
    dispose() {
      if (disposed) return
      disposed = true; started = false; epoch++; refreshQueued = false
      cancel(nextTimer); nextTimer = undefined
      cancel(pending?.timer)
      if (pending) pending.timer = undefined
      publish([])
    },
  }
}

/** Serialized into our own guest. Geometry only: never read text, input values or storage. */
export function readWebsiteWindowDragGeometry(doc: Document, origin: string, hostInset = 0): WindowDragGeometry | null {
  const view = doc.defaultView
  if (origin !== 'https://chat.deepseek.com' || !view || doc.documentElement.hasAttribute('data-dsh-chat-fallback')
    || doc.documentElement.hasAttribute('data-dsh-chat-preparing')) return null
  const content = doc.querySelector<HTMLElement>('[data-dsh-chat-content]')
  if (!content || !doc.querySelector('[data-dsh-chat-navigation]')) return null
  const visible = (node: Element) => {
    const r = node.getBoundingClientRect(), style = view.getComputedStyle(node)
    return r.width > 0 && r.height > 0 && style.display !== 'none' && style.visibility === 'visible'
  }
  // Never put native drag hit targets above website dialogs, menus or title editing.
  if ([...doc.querySelectorAll('[role="dialog"],[role="menu"],[role="listbox"],.ds-modal-content,.ds-dropdown-menu,.ds-popover')].some(visible)) return null
  const active = doc.activeElement
  if (active?.matches('input,textarea,[contenteditable="true"],[contenteditable="plaintext-only"]')
    && active.getBoundingClientRect().top < 48) return null
  const width = view.innerWidth, height = view.innerHeight
  if (!Number.isFinite(hostInset) || hostInset < 0 || hostInset > width) return null
  const bounds = content.getBoundingClientRect()
  if (bounds.top < -1 || bounds.top > 1 || bounds.width < 160 || bounds.height < 48 || bounds.right > width + 1) return null
  const inset = Number.parseFloat(doc.documentElement.style.getPropertyValue('--dsh-chat-title-inset')) || 24
  // Host leading controls can move before the guest's next CSS adaptation.
  const start = Math.max(bounds.left + 8, inset, hostInset), end = Math.min(width - 8, bounds.right - 8)
  const blocked: { left: number; right: number }[] = []
  const reserve = (left: number, right: number) => { if (right > start && left < end) blocked.push({left: Math.max(start,left),right: Math.min(end,right)}) }
  const header = content.querySelector<HTMLElement>('[data-dsh-chat-header-row]')
  // A confirmed conversation header bounds text geometry. Don't walk every
  // paragraph/code block in a long answer on the lightweight sampling path.
  const nodes = header ? new Set([...header.querySelectorAll<HTMLElement>('*'),
    ...content.querySelectorAll<HTMLElement>('button,a[href],input,textarea,select,[role="button"],[tabindex],[contenteditable]')])
    : new Set(content.querySelectorAll<HTMLElement>('*'))
  if (nodes.size > 5000) return null
  for (const node of nodes) {
    const r = node.getBoundingClientRect()
    if (r.top >= 40 || r.bottom <= 0 || !visible(node)) continue
    const interactive = node.matches('button,a[href],input,textarea,select,[role="button"],[tabindex],[contenteditable],svg,img,canvas,video,iframe')
    // Detect occupied text boxes without reading the characters (including messages).
    const textBox = node.childElementCount === 0 && [...node.childNodes].some(child => child.nodeType === 3)
    const titleHost = node.hasAttribute('data-dsh-chat-header-title-host')
    if (interactive || textBox || titleHost) reserve(r.left - 8, r.right + 8)
  }
  blocked.sort((a,b) => a.left - b.left)
  const regions: WindowDragRegion[] = []
  let left = start
  for (const item of blocked) {
    if (item.left - left >= 24) regions.push({left,top:0,width:item.left-left,height:40})
    left = Math.max(left,item.right)
  }
  if (end - left >= 24) regions.push({left,top:0,width:end-left,height:40})
  return regions.length <= 8 ? {width,height,regions} : null
}

export function websiteWindowDragScript(hostInset = 0): string {
  return `(${readWebsiteWindowDragGeometry.toString()})(document,location.origin,${JSON.stringify(Number.isFinite(hostInset) ? hostInset : -1)})`
}

/** Guest numbers are untrusted: keep every native hit target inside this measured viewport. */
export function parseWindowDragGeometry(value: unknown, viewport: { readonly width: number; readonly height: number }): readonly WindowDragRegion[] {
  if (!value || typeof value !== 'object') return []
  const source = value as Partial<WindowDragGeometry>
  if (typeof source.width !== 'number' || typeof source.height !== 'number'
    || !Number.isFinite(source.width) || !Number.isFinite(source.height)
    || Math.abs(source.width - viewport.width) > 1 || Math.abs(source.height - viewport.height) > 1
    || !Array.isArray(source.regions) || source.regions.length > 8) return []
  const result: WindowDragRegion[] = []
  let right = 0
  for (const region of source.regions) {
    if (!region || ![region.left,region.top,region.width,region.height].every(v => typeof v === 'number' && Number.isFinite(v))
      || region.left < right || region.top !== 0 || region.width < 24 || region.height !== 40
      || region.left + region.width > viewport.width || region.height > viewport.height) return []
    right = region.left + region.width
    result.push({left:region.left,top:region.top,width:region.width,height:region.height})
  }
  return result
}

/** Holes in a full 40px drag row. Invalid gaps fail closed to one full-width exclusion. */
export function windowDragExclusions(regions: readonly WindowDragRegion[], width: number): readonly WindowDragRegion[] {
  if (!Number.isFinite(width) || width <= 0) return []
  const fullRow = [{ left: 0, top: 0, width, height: 40 }]
  if (regions.some(region => !region || ![region.left, region.top, region.width, region.height].every(Number.isFinite)
    || region.left < 0 || region.top !== 0 || region.width <= 0 || region.height !== 40 || region.left + region.width > width)) return fullRow
  const gaps = [...regions].sort((a, b) => a.left - b.left)
  const exclusions: WindowDragRegion[] = []
  let right = 0
  for (const region of gaps) {
    if (region.left > right) exclusions.push({ left: right, top: 0, width: region.left - right, height: 40 })
    right = Math.max(right, region.left + region.width)
  }
  if (right < width) exclusions.push({ left: right, top: 0, width: width - right, height: 40 })
  return exclusions
}
