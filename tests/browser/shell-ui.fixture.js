import { bindChatSettingsIcon } from '/icon.js'
import { acquireChatStyles } from '/styles.js'

const results = []
const check = (name, passed) => { results.push({ name, passed: Boolean(passed) }) }
const commit = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
const marker = 'data-dsh-chat-settings-icon'
const releaseStyles = acquireChatStyles(document)
const list = document.getElementById('chat-list')
const reference = document.getElementById('reference')
for (let index = 0; index < 40; index++) {
  for (const target of [list, reference]) { const row = document.createElement('div'); row.className = 'row'; row.textContent = `Fictional conversation ${index + 1}`; target.append(row) }
}
const pseudo = (node, part) => getComputedStyle(node, `::-webkit-scrollbar${part}`)
check('CHAT retains standard auto scrollbar width, as HARNESS', getComputedStyle(list).scrollbarWidth === 'auto' && getComputedStyle(reference).scrollbarWidth === 'auto')
check('shared WebKit scrollbar width is 5px on both lists', pseudo(list, '').width === '5px' && pseudo(list, '').width === pseudo(reference, '').width)
check('stable scrollbar gutter matches HARNESS', getComputedStyle(list).scrollbarGutter === getComputedStyle(reference).scrollbarGutter)
check('light scrollbar thumb uses host token', pseudo(list, '-thumb').backgroundColor === 'rgb(207, 211, 214)' && pseudo(list, '-thumb').backgroundColor === pseudo(reference, '-thumb').backgroundColor)
document.body.setAttribute('data-dark', '')
check('dark scrollbar thumb follows host theme without plugin rewrite', pseudo(list, '-thumb').backgroundColor === 'rgb(84, 85, 87)' && pseudo(list, '-thumb').backgroundColor === pseudo(reference, '-thumb').backgroundColor)
document.body.style.setProperty('--dsh-scrollbar-width', '7px')
check('host scrollbar width changes propagate to both lists', pseudo(list, '').width === '7px' && pseudo(reference, '').width === '7px')
document.body.style.removeProperty('--dsh-scrollbar-width')
list.scrollTop = 120
check('conversation list remains scrollable', list.scrollTop === 120 && list.scrollHeight > list.clientHeight)
const region = document.getElementById('chat-region')
const referenceRegion = document.getElementById('reference-region')
const gap = (container, target) => container.getBoundingClientRect().right - target.getBoundingClientRect().right
const nearly = (actual, expected) => Math.abs(actual - expected) < 0.1
const sameClearance = () => nearly(gap(region, list), 2) && nearly(gap(referenceRegion, reference), 2)
const sameRowInset = expected => nearly(gap(region, list.firstElementChild), expected) && nearly(gap(referenceRegion, reference.firstElementChild), expected)
check('right scrollbar clearance is 2px in both modes', sameClearance())
check('row right edge retains the native 12px inset', sameRowInset(12))
let resized = true
for (const width of [196, 360]) {
  document.querySelectorAll('.box').forEach(box => { box.style.width = `${width}px` })
  resized &&= sameClearance() && sameRowInset(12)
}
check('narrow and wide sidebars preserve native scrollbar geometry', resized)
document.querySelectorAll('.box').forEach(box => { box.style.width = '' })
region.style.setProperty('--dsh-sidebar-inline-padding', '20px')
referenceRegion.style.setProperty('--dsh-sidebar-inline-padding', '20px')
check('host sidebar padding changes preserve native row inset', sameClearance() && sameRowInset(20))
region.style.removeProperty('--dsh-sidebar-inline-padding')
referenceRegion.style.removeProperty('--dsh-sidebar-inline-padding')
check('normal conversation lists have no horizontal overflow', list.scrollWidth === list.clientWidth && reference.scrollWidth === reference.clientWidth)
for (const target of [list, reference]) target.firstElementChild.textContent = 'Long fictional conversation title '.repeat(30)
check('long titles clip without changing scrollbar or row boundaries', sameClearance() && sameRowInset(12) && list.scrollWidth === list.clientWidth && reference.scrollWidth === reference.clientWidth)
const chatRows = [...list.children], referenceRows = [...reference.children]
list.replaceChildren(chatRows[0]); reference.replaceChildren(referenceRows[0])
check('short lists retain the stable gutter and native edge clearance', list.scrollHeight === list.clientHeight && reference.scrollHeight === reference.clientHeight && sameClearance() && sameRowInset(12))
list.replaceChildren(...chatRows); reference.replaceChildren(...referenceRows)
check('overflow returning preserves native scrollbar geometry', list.scrollHeight > list.clientHeight && reference.scrollHeight > reference.clientHeight && sameClearance() && sameRowInset(12))

const makePanel = () => {
  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'presentation')
  overlay.innerHTML = `<div data-shortcut-modal="settings" role="dialog" aria-modal="true"><nav><div>
    <button type="button"><svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor"/></svg><span>General</span></button>
    <button type="button"><svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5" fill="none" stroke="currentColor"/></svg><span>Chat 设置</span></button>
  </div></nav><main>Fictional account status; no personal data.</main></div>`
  document.body.append(overlay)
  return overlay
}
let release = bindChatSettingsIcon(document)
let overlay = makePanel()
await commit()
let panel = overlay.firstElementChild
let [other, own] = panel.querySelectorAll('button')
const original = own.innerHTML
check('late-opened settings panel decorates only Chat row', own.getAttribute(marker) === 'chat' && !other.hasAttribute(marker))
check('native gear is only visually hidden', getComputedStyle(own.querySelector('svg')).display === 'none' && own.innerHTML === original)
check('chat bubble mask renders at native 16px size', getComputedStyle(own, '::before').maskImage.includes('data:image/svg+xml') && getComputedStyle(own, '::before').width === '16px')
check('chat bubble inherits current theme colour', getComputedStyle(own, '::before').backgroundColor === getComputedStyle(own).color)
let clicks = 0
own.addEventListener('click', () => clicks++)
own.click()
check('settings selection click remains unchanged', clicks === 1 && own.type === 'button' && own.tabIndex === 0)
own.lastElementChild.textContent = 'Chat settings'
await commit()
check('English label preserves the icon without changing text', own.getAttribute(marker) === 'chat' && own.lastElementChild.textContent === 'Chat settings')
const duplicate = own.cloneNode(true)
duplicate.removeAttribute(marker)
own.parentElement.append(duplicate)
await commit()
check('ambiguous duplicate labels fall back to native icons', !own.hasAttribute(marker) && !duplicate.hasAttribute(marker))
duplicate.remove()
await commit()
check('unambiguous row recovers without a timer', own.getAttribute(marker) === 'chat')
const duplicatePanel = panel.cloneNode(true)
duplicatePanel.querySelectorAll(`[${marker}]`).forEach(node => node.removeAttribute(marker))
overlay.append(duplicatePanel)
await commit()
check('a second dialog within the same portal withdraws the icon', !own.hasAttribute(marker) && !duplicatePanel.querySelector(`[${marker}]`))
duplicatePanel.remove()
await commit()
check('removing the second dialog rediscovers the unique panel', own.getAttribute(marker) === 'chat')
overlay.removeAttribute('role')
await commit()
check('an unknown portal wrapper withdraws decoration', !own.hasAttribute(marker))
overlay.setAttribute('role', 'presentation')
await commit()
check('the recognized wrapper can recover without reopening settings', own.getAttribute(marker) === 'chat')
const unknown = document.createElement('i')
own.append(unknown)
await commit()
check('changed row shape restores the native gear', !own.hasAttribute(marker) && getComputedStyle(own.querySelector('svg')).display !== 'none')
unknown.remove()
await commit()
panel.removeAttribute('aria-modal')
await commit()
check('nonmatching dialog cannot retain decoration', !own.hasAttribute(marker))
panel.setAttribute('aria-modal', 'true')
await commit()
release()
check('plugin cleanup removes marker and restores native icon', !own.hasAttribute(marker) && getComputedStyle(own.querySelector('svg')).display !== 'none')
check('other settings row remains entirely untouched', !other.hasAttribute(marker) && getComputedStyle(other.querySelector('svg')).display !== 'none')
own.setAttribute(marker, 'previous')
release = bindChatSettingsIcon(document)
release()
check('cleanup restores a pre-existing owned attribute value', own.getAttribute(marker) === 'previous')
own.removeAttribute(marker)
release = bindChatSettingsIcon(document)
overlay.remove()
await commit()
overlay = makePanel()
await commit()
own = overlay.querySelectorAll('button')[1]
check('close and reopen settings rebinds the new row', own.getAttribute(marker) === 'chat')
release()
const before = document.querySelector('style[data-dsh-deepseek-chat-styles]')
releaseStyles()
check('stylesheet lease cleanup is complete', before && !before.isConnected && !document.querySelector(`[${marker}="chat"]`))
// Leave a labelled synthetic preview for a screenshot; no real DSH/website is loaded.
acquireChatStyles(document)
bindChatSettingsIcon(document)
document.body.removeAttribute('data-dark')
document.getElementById('results').textContent = JSON.stringify(results, null, 2)
window.fixtureResults = results
await fetch('/results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(results) })
