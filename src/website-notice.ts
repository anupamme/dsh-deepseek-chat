/** Close only the fixed website environment notice the user asked to dismiss. */
export function dismissWebsiteEnvironmentNotice(doc: Document): void {
  if (doc.location.origin !== 'https://chat.deepseek.com' || !doc.defaultView) return
  const attempted = 'data-dsh-chat-environment-notice-closed'
  const normalize = (text: string | null) => (text ?? '').replace(/\s+/g, '')
  const messages = [
    ['使用环境异常', '当前页面的使用环境可能存在数据和隐私泄露风险，为保障安全，建议您使用我们的官方产品。'],
    ['Abnormal usage environment', 'The current usage environment may pose data and privacy risks. For your security, we recommend using our official product.'],
  ]
  const visible = (element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const style = doc.defaultView!.getComputedStyle(element)
    return element.isConnected && rect.width > 0 && rect.height > 0
      && style.display !== 'none' && style.visibility !== 'hidden'
      && !element.closest('[hidden],[aria-hidden="true"]')
  }
  const dialogs = [...doc.querySelectorAll<HTMLElement>('.ds-modal-content[role="dialog"]')].filter(dialog => {
    if (dialog.hasAttribute(attempted) || !visible(dialog)
      || dialog.querySelector('form,input,textarea,select,[contenteditable="true"],iframe')) return false
    const title = dialog.querySelector<HTMLElement>('.ds-modal-content__title')
    const main = dialog.querySelector<HTMLElement>('.ds-modal-content__main')
    return title?.closest('.ds-modal-content') === dialog && main?.closest('.ds-modal-content') === dialog
      && messages.some(([heading, body]) => normalize(title.textContent) === normalize(heading)
        && normalize(main.textContent) === normalize(body))
  })
  if (dialogs.length !== 1) return
  const dialog = dialogs[0]
  const buttons = [...dialog.querySelectorAll<HTMLElement>('.ds-modal-content__close')].filter(button =>
    button.closest('.ds-modal-content') === dialog && button.matches('button,[role="button"]')
    && !button.closest('[disabled],[aria-disabled="true"]') && visible(button))
  if (buttons.length !== 1) return
  // Keep this node's attempted marker through ordinary layout restoration.
  // The website's own X handler records its preference and removes the dialog.
  dialog.setAttribute(attempted, '')
  try { buttons[0].click() } catch { /* Keep the original notice if its handler fails. */ }
}
