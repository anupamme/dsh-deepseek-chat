/** Serialized into the website guest; copied text never leaves that document. */
export function configureWebsiteShareCopy(doc: Document, enabled: boolean): void {
  const win = doc.defaultView
  if (!win || win.location.origin !== 'https://chat.deepseek.com') return
  const state = win as Window & { __dshShareCopyCleanup?: () => void }
  if (!enabled) { state.__dshShareCopyCleanup?.(); return }
  if (state.__dshShareCopyCleanup) return
  const clipboard = win.navigator.clipboard
  if (!clipboard || typeof clipboard.writeText !== 'function') return
  const original = clipboard.writeText
  const descriptor = Object.getOwnPropertyDescriptor(clipboard, 'writeText')
  let active = true
  const fallback = (text: string): boolean => {
    if (!active || !doc.hasFocus()) return false
    const previous = doc.activeElement instanceof HTMLElement ? doc.activeElement : null
    // Prefer the focused modal boundary. Do not append outside a modal focus trap.
    const visible = (node: HTMLElement) => node.getBoundingClientRect().width > 0
      && node.getBoundingClientRect().height > 0 && win.getComputedStyle(node).visibility !== 'hidden'
    const dialogs = [...doc.querySelectorAll<HTMLElement>('[role="dialog"],[aria-modal="true"],dialog[open],.ds-modal-content')].filter(visible)
    const modal = previous?.closest<HTMLElement>('[role="dialog"],[aria-modal="true"],dialog[open],.ds-modal-content')
      ?? dialogs.at(-1)
    const parent = modal ?? (previous && previous !== doc.body ? previous.parentElement : doc.body)
    if (!parent) return false
    const selection = win.getSelection()
    const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : []
    const input = previous instanceof HTMLInputElement || previous instanceof HTMLTextAreaElement ? previous : null
    const start = input?.selectionStart, end = input?.selectionEnd, direction = input?.selectionDirection
    const field = doc.createElement('textarea')
    field.value = text
    field.tabIndex = -1
    field.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;font-size:16px;'
    try {
      parent.append(field)
      field.focus({ preventScroll: true })
      field.select()
      // execCommand may return true even when focus was trapped elsewhere.
      if (doc.activeElement !== field || field.selectionStart !== 0 || field.selectionEnd !== text.length) return false
      return doc.execCommand('copy')
    } catch { return false }
    finally {
      field.remove()
      if (previous?.isConnected) previous.focus({ preventScroll: true })
      if (input?.isConnected && start !== null && start !== undefined && end !== null && end !== undefined) {
        try { input.setSelectionRange(start, end, direction ?? undefined) } catch { /* Non-text fields have no selection. */ }
      } else if (selection) {
        try { selection.removeAllRanges(); for (const range of ranges) selection.addRange(range) } catch { /* The site may replace its dialog. */ }
      }
    }
  }
  const wrapped: Clipboard['writeText'] = async function (text) {
    try { await original.call(clipboard, text) }
    catch (error) {
      // Exact share URLs only: leave message/code copy and all other sites untouched.
      if (typeof text !== 'string' || !/^https:\/\/chat\.deepseek\.com\/share\/[A-Za-z0-9_-]+$/.test(text)
        || !fallback(text)) throw error
    }
  }
  try { Object.defineProperty(clipboard, 'writeText', { configurable: true, writable: true, value: wrapped }) }
  catch { return }
  const cleanup = () => {
    active = false
    if (clipboard.writeText === wrapped) {
      if (descriptor) Object.defineProperty(clipboard, 'writeText', descriptor)
      else delete (clipboard as Partial<Clipboard>).writeText
    }
    if (state.__dshShareCopyCleanup === cleanup) delete state.__dshShareCopyCleanup
  }
  state.__dshShareCopyCleanup = cleanup
}
