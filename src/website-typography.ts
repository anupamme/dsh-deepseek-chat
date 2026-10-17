/** Match the host content font without changing webpage chrome or reading message text. */
export function applyWebsiteTypography(doc: Document, fontSize: number | null): void {
  const id = 'dsh-chat-website-typography'
  if (doc.defaultView?.location.origin !== 'https://chat.deepseek.com' || fontSize === null) {
    doc.getElementById(id)?.remove()
    return
  }
  const size = Number.isFinite(fontSize) && fontSize >= 10 && fontSize <= 32 ? fontSize : 14
  // Native HARNESS uses size+10 for assistant prose and size+8 for user bubbles.
  // Keep headings, code, thinking text, controls and dialogs on their own native scales.
  const scope = '[data-dsh-chat-content]'
  const excluded = ':not(.ds-think-content *,[role="dialog"] *,.ds-modal-content *)'
  const composer = `${scope} ._77cefa5:has(textarea._27c9245)${excluded}`
  const css = `${scope} .ds-markdown${excluded}{font-size:${size}px!important;line-height:${size + 10}px!important}
${scope} .fbb737a4${excluded}{font-size:${size}px!important;line-height:${size + 8}px!important}
${scope} .ds-markdown${excluded} code:not(.md-code-block *){font-size:var(--dsw-font-markdown-code-font-size,14px)!important}
${composer}{--line-height:${size + 10}px}
${composer} :is(textarea._27c9245,.b13855df){font-size:${size}px!important;line-height:${size + 10}px!important}
${composer} textarea._27c9245::placeholder{font-size:inherit;line-height:inherit}`
  let style = doc.getElementById(id) as HTMLStyleElement | null
  if (!style) { style = doc.createElement('style'); style.id = id; doc.head.append(style) }
  if (style.textContent !== css) style.textContent = css
}
