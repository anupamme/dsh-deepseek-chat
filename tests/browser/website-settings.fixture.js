import { adaptWebsiteSettings } from '/adapter.js'
import { adaptWebsiteHeader } from '/header.js'
import { chatStyles } from '/styles.js'
import { adaptWebsiteNavigation, parseWebsiteNavigation } from '/navigation.js'
// Fictional public controls, no website requests, credentials or storage.
const results=[]
const check=(name,passed)=>results.push({name,passed:!!passed})
function fixture(initial='English', initialTheme='Dark') {
 const doc=document.implementation.createHTMLDocument('public settings fixture')
 doc.body.innerHTML='<div id="profile"><div role="button">Unrelated</div><div id="avatar"><img alt="avatar"></div></div>'
 doc.documentElement.setAttribute('data-dsh-chat-dark-complete','')
 let language=initial, theme=initialTheme, unrelated=0, danger=0, menus=0, logout=0
 doc.querySelector('[role=button]').onclick=()=>unrelated++
 doc.querySelector('#avatar').onclick=()=>{
  menus++
  const menu=doc.createElement('div');menu.className='ds-dropdown-menu'
  menu.innerHTML='<button>Settings</button><button>Log out</button>'
  menu.children[0].onclick=()=>{menu.remove();openModal()}
  menu.children[1].onclick=()=>{logout++;menu.remove()}
  doc.body.append(menu)
 }
 function openModal(){
  const modal=doc.createElement('div');modal.className='ds-modal-content'
  modal.innerHTML='<header>Settings<button><svg></svg></button></header><nav><div>General</div><div>Profile</div></nav><section><div><span>Language</span><button class="ds-button">Light</button><div class="ds-select" tabindex="0"><span>'+language+'</span><svg></svg></div></div><div id=theme><span>Theme</span><button aria-pressed=false>Light</button><button aria-pressed=false>Dark</button><button aria-pressed=false>System</button></div><button>Log out all devices</button><button>Delete account</button></section>'
  modal.querySelector('header button').onclick=()=>modal.remove()
  const themeControls=[...modal.querySelectorAll('#theme button')]
  const updateTheme=()=>themeControls.forEach(b=>b.setAttribute('aria-pressed',String(b.textContent===theme)))
  themeControls.forEach(b=>b.onclick=()=>{theme=b.textContent;updateTheme()});updateTheme()
  modal.querySelectorAll('section > button').forEach(b=>b.onclick=()=>danger++)
  const select=modal.querySelector('.ds-select')
  select.querySelector('span').onpointerdown=()=>{
   if(doc.querySelector('[role=listbox]'))return
   const options=doc.createElement('div')
   for(const value of ['English','简体中文','System']){
    const button=doc.createElement('label');button.textContent=value
    button.onclick=()=>{language=value;select.querySelector('span').textContent=value;options.remove()}
    options.append(button)
   }
   doc.body.append(options)
  }
  doc.body.append(modal)
 }
 const step=command=>adaptWebsiteSettings(doc,doc.querySelector('#profile'),command)
 const poll=()=>step({type:'snapshot',showOriginal:false})
 const settle=()=>{for(let i=0;i<20;i++)poll();return poll()}
 return {doc,step,poll,settle,counts:()=>({unrelated,danger,menus,logout}),language:()=>language,theme:()=>theme}
}
const read=fixture();read.step({type:'settings-read'});const rs=read.settle()
check('reads actual language through the public profile menu',rs.language==='English' && !rs.pending && !rs.error)
check('uses avatar instead of unrelated role button',read.counts().menus===1 && read.counts().unrelated===0)
check('read closes the official settings modal',!read.doc.querySelector('.ds-modal-content'))
read.step({type:'setting',key:'language',value:'zh-CN'});const changed=read.settle()
check('native language command changes the website control',read.language()==='简体中文' && changed.language==='简体中文' && !changed.pending && !changed.error)
check('language operation never changes account/security data',read.counts().danger===0)
read.step({type:'logout'});read.settle()
check('logout invokes only the current-session menu item',read.counts().logout===1 && read.counts().danger===0)
const restore=fixture();restore.step({type:'preferences',language:'zh-CN'});const restored=restore.settle()
check('saved language restores through the website UI',restored.restored && restored.language==='简体中文' && !restored.pending)
const stale=fixture('English','Light');stale.step({type:'setting',key:'language',value:'zh-CN'});stale.settle()
check('language write repairs a stale dark completion marker',stale.theme()==='Dark')
const failedDark=fixture();failedDark.step({type:'preferences'});failedDark.doc.documentElement.setAttribute('data-dsh-chat-settings-deadline','1');failedDark.poll()
check('failed dark operation never marks dark complete',!failedDark.doc.documentElement.hasAttribute('data-dsh-chat-dark-complete'))
const deadline=fixture();deadline.step({type:'settings-read'});deadline.doc.documentElement.setAttribute('data-dsh-chat-settings-deadline','1');const expired=deadline.poll()
check('timeout stops pending and provides a retryable error',!expired.pending && expired.error && !/profile|DIV|diagnostic/.test(expired.error))
const headerFrame=document.createElement('iframe')
headerFrame.style.cssText='position:absolute;left:-9000px;width:800px;height:600px;border:0'
document.body.append(headerFrame)
const hd=headerFrame.contentDocument
hd.body.innerHTML='<main id="content"><header style="height:48px;width:500px;margin:auto;display:flex;align-items:center;justify-content:space-between"><span>Fictional title</span><button aria-label="Share"><svg width="16" height="16"></svg></button></header><textarea></textarea></main>'
const content=hd.querySelector('main')
let shares=0
hd.querySelector('button').onclick=()=>shares++
adaptWebsiteHeader(hd,content,'Fictional title',24)
const title=hd.querySelector('[data-dsh-chat-header-title]'), share=hd.querySelector('[data-dsh-chat-header-share]')
const expanded=title?.getBoundingClientRect(), shareRect=share?.getBoundingClientRect()
check('expanded header anchors title left and share right', expanded?.left===24 && expanded.top===0 && shareRect.right===788)
adaptWebsiteHeader(hd,content,'Fictional title',184)
const folded=title?.getBoundingClientRect()
check('collapsed header changes only horizontal title inset', folded?.left===184 && folded.top===expanded.top && folded.height===expanded.height)
check('header layout never invokes sharing', shares===0)
const multi=hd.createElement('section');multi.style.cssText='position:absolute;left:0;top:0;width:800px;height:60px'
multi.innerHTML='<div style="position:absolute;top:12px;left:150px;height:48px;text-align:center"><div style="width:70px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Another title</div></div><button style="position:absolute;left:4px;top:10px;width:28px;height:28px"><svg></svg></button><button style="position:absolute;left:44px;top:10px;width:28px;height:28px"><svg></svg></button><button style="position:absolute;right:12px;top:10px;width:28px;height:28px"><svg></svg></button>'
hd.body.append(multi)
adaptWebsiteHeader(hd,hd.body,'Another title',24)
check('realistic compact navigation row locates unlabelled rightmost share',multi.querySelector('[data-dsh-chat-header-share]')===multi.querySelectorAll('button')[2] && multi.querySelector('[data-dsh-chat-header-title]')?.getBoundingClientRect().left===24)

adaptWebsiteHeader(hd,content,null,24)
check('new conversation removes stale header markers', !hd.querySelector('[data-dsh-chat-header-title],[data-dsh-chat-header-share],[data-dsh-chat-header-row]'))
headerFrame.remove()
// Header replacements are timed by the browser; only the initial adapter call is made.
await nativeHeaderRegressions()
const keyboardSelect=componentStyleRegressions()
lateProfileRegressions()
const keyboardInstructions=document.querySelector('#keyboard-instructions')
const finish=()=>{
 document.querySelector('#results').textContent=JSON.stringify(results,null,2)
 return fetch('/results',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(results)})
}
// Automatic browser geometry and adapter checks finish independently of the
// macOS native-menu keyboard check. Use the explicit manual URL to include it.
if(new URL(location.href).searchParams.get('keyboard')!=='manual'){
 window.websiteSettingsKeyboardReady=false
 finish()
}else{
 keyboardInstructions.hidden=false
// Do not synthesize keyboard events or assign a new option to make this pass.
// The runner must send real keys to this focused native select. On macOS,
// the first ArrowDown may open a native menu; send a second then Enter.
const keyboardCompletion=new Promise(resolve=>{
 const keys=new Set()
 const trace=[]
 window.websiteSettingsKeyboardTrace=trace
 const record=(type,key)=>{
  // This trace belongs only to the fictional native language select. Native
  // popup menus can consume Enter before a DOM keydown is delivered on macOS.
  if(trace.length<16)trace.push({type,...(key?{key}:{}),trusted:true,selected:keyboardSelect.value})
  document.querySelector('#results').textContent=JSON.stringify({keyboardReady:true,completedCases:results.length,keyboardTrace:trace,results},null,2)
 }
 let changed=false,completed=false
 const complete=()=>{
  if(!completed && changed && keys.has('ArrowDown') && keyboardSelect.value==='zh-CN'){
   completed=true;clearTimeout(deadline);resolve(true)
  }
 }
 keyboardSelect.addEventListener('keydown',event=>{
  if(event.isTrusted){keys.add(event.key);if(['ArrowDown','ArrowUp','Enter'].includes(event.key))record('keydown',event.key);requestAnimationFrame(complete)}
 })
 keyboardSelect.addEventListener('change',event=>{
  if(event.isTrusted){changed=true;record('change');requestAnimationFrame(complete)}
 })
 const deadline=setTimeout(()=>{if(!completed){completed=true;resolve(false)}},120000)
 keyboardSelect.focus()
 window.websiteSettingsKeyboardReady=true
 document.querySelector('#results').textContent=JSON.stringify({keyboardReady:true,completedCases:results.length,results},null,2)
 fetch('/keyboard-ready',{method:'POST'})
})
// Keep page load available to the real browser driver while keyboard input is pending.
keyboardCompletion.then(passed=>{
 window.websiteSettingsKeyboardReady=false
 check('native language select accepts trusted keyboard selection',passed)
 return finish()
})
}

function componentStyleRegressions(){
 const style=document.createElement('style');style.textContent=chatStyles;document.head.append(style)
 const brand=document.createElement('div')
 brand.className='dsh-chat-brand-control'
 brand.style.cssText='left:20px;top:100px;width:112px;height:24px'
 brand.innerHTML='<div class="dsh-chat-mode-wrap"><fieldset class="dsh-chat-modes" aria-label="Fixture modes"><button type="button" aria-pressed="true">CHAT</button><button type="button" aria-pressed="false">HARNESS</button></fieldset></div>'
 document.body.append(brand)
 const modes=brand.querySelector('fieldset'),buttons=[...modes.querySelectorAll('button')]
 const modesStyle=getComputedStyle(modes),buttonStyles=buttons.map(button=>getComputedStyle(button))
 check('brand mode switcher has a 23px outer height',near(modes.getBoundingClientRect().height,23))
 check('brand CHAT and HARNESS buttons both have 21px height',buttons.every(button=>near(button.getBoundingClientRect().height,21)))
 check('brand switcher retains 1px padding and rounded outer and inner corners',modesStyle.paddingTop==='1px' && modesStyle.paddingBottom==='1px' && modesStyle.borderTopLeftRadius==='5px' && buttonStyles.every(style=>style.borderTopLeftRadius==='4px'))
 check('brand button font and line height fit within the compact height',buttonStyles.every(style=>style.fontSize==='9px' && style.lineHeight==='13px'))
 brand.remove()
 const settings=document.createElement('section')
 settings.className='dsh-chat-settings'
 settings.style.cssText='max-width:500px;color:#eee;margin:16px 0;font-size:14px'
 settings.innerHTML='<label class="dsh-chat-settings-language">Fixture system language<span class="dsh-chat-settings-select"><select aria-label="Fixture native language"><option value="system">Follow system</option><option value="zh-CN">简体中文</option><option value="en">English</option></select><svg class="dsh-chat-settings-select-arrow" viewBox="0 0 12 12" aria-hidden="true" focusable="false" fill="none"><path d="m2 4 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span></label>'
 document.body.insertBefore(settings,document.querySelector('#results'))
 const select=settings.querySelector('select'),wrapper=settings.querySelector('.dsh-chat-settings-select'),arrow=settings.querySelector('svg')
 const selectStyle=getComputedStyle(select),arrowStyle=getComputedStyle(arrow)
 const wr=wrapper.getBoundingClientRect(),ar=arrow.getBoundingClientRect()
 check('language control remains an enabled native three-option select',select instanceof HTMLSelectElement && !select.disabled && select.options.length===3 && !select.hasAttribute('role'))
 check('language chevron is 12px wide and 12px inside the right edge',near(ar.width,12) && near(ar.height,12) && near(wr.right-ar.right,12) && near((ar.top+ar.bottom)/2,(wr.top+wr.bottom)/2))
 check('language chevron is decorative and leaves native selection available',selectStyle.appearance==='none' && selectStyle.paddingRight==='38px' && arrowStyle.pointerEvents==='none' && arrow.getAttribute('aria-hidden')==='true' && arrow.getAttribute('focusable')==='false')
 return select
}
function near(actual,expected){return Number.isFinite(actual) && Math.abs(actual-expected)<0.1}


async function nativeHeaderRegressions(){
 const frame=document.createElement('iframe')
 frame.style.cssText='position:absolute;left:-9000px;width:800px;height:600px;border:0'
 document.body.append(frame)
 const doc=frame.contentDocument
 doc.documentElement.style.cssText='font:14px/20px sans-serif'
 doc.body.style.cssText='margin:0;width:100%;height:600px;overflow:hidden'
 const nativeInputStyle=doc.createElement('style')
 nativeInputStyle.textContent='.ds-input{position:relative;display:inline-flex;height:40px}.ds-input::before,.ds-input::after{content:"";position:absolute;inset:0;border:1px solid #7d98ed;border-radius:22px;background:rgba(77,107,254,.08);box-shadow:0 0 0 2px rgba(77,107,254,.1)}'
 doc.head.append(nativeInputStyle)
 const main=doc.createElement('main')
 main.setAttribute('data-dsh-chat-content','')
 main.style.cssText='width:100%;height:100%'
 doc.body.append(main)
 let shares=0,focusEvents=0
 const makeRow=state=>{
  const row=doc.createElement('div')
  row.className='_2be88ba'
  row.style.cssText='position:relative;display:flex;align-items:center;justify-content:center;top:0;width:100%;height:48px'
  const host=doc.createElement('div')
  host.className='the-header'
  host.style.cssText='position:absolute;top:12px;left:180px;height:48px;text-align:center'
  const branch=doc.createElement('div')
  branch.className='_9fcbeda'
  branch.style.cssText='display:flex;align-items:center;justify-content:center'
  host.append(branch);row.append(host)
  // The real website also keeps a hidden mobile header beside its desktop
  // editable branch. Desktop adaptation must never make this sibling visible.
  const mobile=doc.createElement('div')
  mobile.className='the-header _1aa2651';mobile.style.display='none'
  mobile.innerHTML='<span>Fictional mobile title</span><button type="button" aria-label="Mobile menu"><svg width="16" height="16"></svg></button><button type="button" aria-label="Mobile new chat"><svg width="16" height="16"></svg></button>'
  row.append(mobile)
  fillBranch(branch,state)
  if(state==='title' || state==='input'){
   const share=doc.createElement('button')
   share.className='_57370c5';share.type='button';share.setAttribute('aria-label','Share')
   share.style.cssText='width:28px;height:28px'
   share.innerHTML='<svg width="16" height="16" aria-hidden="true"></svg>'
   share.onclick=()=>shares++
   row.append(share)
  }
  return row
 }
 const fillBranch=(branch,state)=>{
  branch.replaceChildren()
  if(state==='skeleton'){
   const skeleton=doc.createElement('div')
   skeleton.className='ds-skeleton';skeleton.style.cssText='display:block;width:180px;height:24px;background:#ddd'
   branch.append(skeleton)
  }else if(state==='title'){
   const label=doc.createElement('div')
   label.className='afa34042 e37a04e4';label.textContent='Fictional native title'
   label.style.cssText='line-height:28px;width:280px;text-align:center'
   branch.append(label)
  }else if(state==='input'){
   const wrapper=doc.createElement('div');wrapper.className='ds-input'
   const input=doc.createElement('input')
   input.type='text';input.placeholder='Fictional native title';input.setAttribute('aria-label','Fixture rename')
   input.style.cssText='height:40px;line-height:28px;padding:6px 10px;border-radius:12px'
   input.onfocus=()=>focusEvents++
   const mirror=doc.createElement('div');mirror.className='ds-input__mirror'
   mirror.style.cssText='position:absolute;visibility:hidden;white-space:pre;width:360px'
   mirror.innerHTML='<span>Fictional measurement text longer than the visible input</span>'
   wrapper.append(input,mirror);branch.append(wrapper)
  }
 }
 let row=makeRow('skeleton');main.append(row)
 // Only the initial adaptation learns the native wrapper. There is no composer,
 // no selected navigation title and no share button in this loading state.
 adaptWebsiteHeader(doc,main,null,24)
 const rect=selector=>doc.querySelector(selector)?.getBoundingClientRect()
 const mobileRemainsHidden=()=>{
  const mobile=doc.querySelector('.the-header._1aa2651'),box=mobile?.getBoundingClientRect()
  const markers=['row','title','share','title-host','editor']
  return !!mobile && doc.defaultView.getComputedStyle(mobile).display==='none' && box.width===0 && box.height===0
   && markers.every(marker=>!mobile.hasAttribute(`data-dsh-chat-header-${marker}`) && !mobile.querySelector(`[data-dsh-chat-header-${marker}]`))
 }
 const measuredEditor=()=>{
  const input=doc.querySelector('.the-header input'),box=input?.getBoundingClientRect()
  if(!input || !box)return null
  const style=doc.defaultView.getComputedStyle(input)
  const wrapper=input.closest('.ds-input'),mirror=wrapper.querySelector('.ds-input__mirror')
  const mirrorStyle=doc.defaultView.getComputedStyle(mirror),wrapperBox=wrapper.getBoundingClientRect()
  const pseudoCleared=['::before','::after'].every(pseudo=>{
   const pseudoStyle=doc.defaultView.getComputedStyle(wrapper,pseudo)
   return ['borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'].every(key=>pseudoStyle[key]==='0px')
    && pseudoStyle.backgroundColor==='rgba(0, 0, 0, 0)' && pseudoStyle.boxShadow==='none'
  })
  return {box,radius:style.borderTopLeftRadius,lineHeight:style.lineHeight,mobileHidden:mobileRemainsHidden(),
   mirrorHidden:mirrorStyle.position==='absolute' && mirrorStyle.visibility==='hidden',
   wrapperExcludesMirror:wrapperBox.width<=box.width+.1 && mirror.getBoundingClientRect().width>box.width,
   pseudoCleared,
   textLeft:box.left+parseFloat(style.borderLeftWidth)+parseFloat(style.paddingLeft),
   textTop:box.top+parseFloat(style.borderTopWidth)+parseFloat(style.paddingTop)}
 }
 const nextCommit=(mutate,measure)=>new Promise(resolve=>setTimeout(()=>{
  mutate()
  // The very first animation frame sees each React-like DOM commit. Nothing
  // invokes either adapter between mutation and this geometry sample.
  frame.contentWindow.requestAnimationFrame(()=>resolve(measure()))
 },0))
 const initialSkeleton=rect('.ds-skeleton'),initialHost=rect('.the-header')
 check('native loading wrapper learns its depth without selected title or composer',doc.documentElement.getAttribute('data-dsh-chat-header-native-depth')==='1' && !doc.querySelector('textarea') && near(initialHost?.left,24) && near(initialHost?.top,0) && near(initialSkeleton?.left,24) && near(initialSkeleton?.top,12) && near(initialSkeleton?.width,180) && near(initialSkeleton?.height,24))
 const titleFrame=await nextCommit(()=>{
  const replacement=makeRow('title');row.replaceWith(replacement);row=replacement
 },()=>({title:rect('.afa34042'),share:rect('._57370c5'),mobileHidden:mobileRemainsHidden()}))
 check('first async title paint anchors left and share right without another adaptation',near(titleFrame.title?.left,24) && near(titleFrame.title?.top,14) && near(titleFrame.title?.height,20) && near(titleFrame.share?.top,10) && near(titleFrame.share?.right,788))
 check('first async desktop title paint keeps the mobile sibling hidden and unmarked',titleFrame.mobileHidden)
 const loadingFrame=await nextCommit(()=>{
  const replacement=makeRow('skeleton');row.replaceWith(replacement);row=replacement
 },()=>({host:rect('.the-header'),skeleton:rect('.ds-skeleton'),share:rect('._57370c5')}))
 check('whole-row async skeleton replacement keeps its size and top-left position',near(loadingFrame.host?.left,24) && near(loadingFrame.host?.top,0) && near(loadingFrame.skeleton?.left,24) && near(loadingFrame.skeleton?.top,12) && near(loadingFrame.skeleton?.width,180) && near(loadingFrame.skeleton?.height,24) && !loadingFrame.share)
 const restoredTitleFrame=await nextCommit(()=>{
  const replacement=makeRow('title');row.replaceWith(replacement);row=replacement
 },()=>({title:rect('.afa34042'),share:rect('._57370c5'),mobileHidden:mobileRemainsHidden()}))
 check('whole-row async title replacement retains the first-frame title line box',near(restoredTitleFrame.title?.left,24) && near(restoredTitleFrame.title?.top,14) && near(restoredTitleFrame.title?.height,20) && near(restoredTitleFrame.share?.right,788))
 const editingFrame=await nextCommit(()=>fillBranch(row.querySelector('._9fcbeda'),'input'),measuredEditor)
 check('expanded async editor is a 28px rounded box with the same text origin',near(editingFrame?.box.left,15) && near(editingFrame?.box.top,10) && near(editingFrame?.box.height,28) && editingFrame?.radius==='6px' && editingFrame?.lineHeight==='20px' && near(editingFrame?.textLeft,restoredTitleFrame.title?.left) && near(editingFrame?.textTop,restoredTitleFrame.title?.top))
 check('first async desktop edit paint keeps the mobile sibling hidden and unmarked',editingFrame?.mobileHidden)
 check('first async editor paint keeps the hidden measurement mirror out of flow',editingFrame?.mirrorHidden && editingFrame?.wrapperExcludesMirror)
 check('first async editor paint clears both native pseudo border shells',editingFrame?.pseudoCleared)
 const input=doc.querySelector('.the-header input'),nativeFocus=input.onfocus
 input.focus()
 check('async title adaptation keeps the website input and native focus handler',doc.querySelector('.the-header input')===input && input.onfocus===nativeFocus && doc.activeElement===input && focusEvents===1)
 // Changing the outer DSH sidebar inset is an intentional adapter call. Each
 // subsequent native title/input replacement still gets no intermediate call.
 adaptWebsiteHeader(doc,main,null,184)
 const collapsedTitleFrame=await nextCommit(()=>fillBranch(row.querySelector('._9fcbeda'),'title'),()=>rect('.afa34042'))
 check('collapsed async title retains its 184px inset on the first frame',near(collapsedTitleFrame?.left,184) && near(collapsedTitleFrame?.top,14) && near(collapsedTitleFrame?.height,20))
 const collapsedEditingFrame=await nextCommit(()=>fillBranch(row.querySelector('._9fcbeda'),'input'),measuredEditor)
 check('collapsed async editor keeps 28px rounding and the display text baseline',near(collapsedEditingFrame?.box.left,175) && near(collapsedEditingFrame?.box.top,10) && near(collapsedEditingFrame?.box.height,28) && collapsedEditingFrame?.radius==='6px' && near(collapsedEditingFrame?.textLeft,collapsedTitleFrame?.left) && near(collapsedEditingFrame?.textTop,collapsedTitleFrame?.top))
 const emptyFrame=await nextCommit(()=>fillBranch(row.querySelector('._9fcbeda'),'empty'),()=>({host:rect('.the-header'),title:rect('.afa34042'),input:rect('input')}))
 check('transient empty native title branch keeps its top-left header contract',near(emptyFrame.host?.left,184) && near(emptyFrame.host?.top,0) && near(emptyFrame.host?.height,48) && !emptyFrame.title && !emptyFrame.input && doc.documentElement.getAttribute('data-dsh-chat-header-native-depth')==='1')
 const collapsedSkeleton=await nextCommit(()=>fillBranch(row.querySelector('._9fcbeda'),'skeleton'),()=>rect('.ds-skeleton'))
 check('collapsed skeleton reappearance is positioned before observer polling',near(collapsedSkeleton?.left,184) && near(collapsedSkeleton?.top,12) && near(collapsedSkeleton?.width,180) && near(collapsedSkeleton?.height,24))
 const mobile=doc.querySelector('.the-header._1aa2651')
 const narrowMobileHidden=await nextCommit(()=>{mobile.style.display='flex'},mobileRemainsHidden)
 check('narrow native mobile flex branch remains hidden on its first frame',narrowMobileHidden)
 check('all native asynchronous header cases leave sharing untouched',shares===0)
 // The real local origin follows navigation's early restore path; it does not
 // bypass the production origin allowlist or install a navigation observer.
 adaptWebsiteNavigation(doc,doc.defaultView.location,{type:'snapshot',showOriginal:true})
 const headerMarkers=['row','title','share','title-host','editor','native-depth']
 check('show-original cleanup removes header CSS markers and restores native mobile flex',!doc.getElementById('dsh-chat-header-style') && !doc.documentElement.style.getPropertyValue('--dsh-chat-title-inset') && !doc.querySelector('[data-dsh-chat-content]') && headerMarkers.every(marker=>!doc.querySelector(`[data-dsh-chat-header-${marker}]`)) && doc.defaultView.getComputedStyle(mobile).display==='flex')
 frame.remove()
}

// A padded public sidebar plus a late avatar reproduced the real reload race.
// Only fictional DOM is used; there are no account requests or storage reads.
function lateProfileRegressions(){
 const doc=document,root=doc.documentElement
 const layout=doc.createElement('div')
 layout.style.cssText='position:fixed;left:0;top:0;display:flex;width:100vw;height:100vh'
 layout.innerHTML='<aside style="width:240px;height:calc(100vh - 20px);padding:10px;box-sizing:content-box;display:flex;flex-direction:column;flex-shrink:0"><button>New chat</button><a href="https://chat.deepseek.com/a/chat/s/fixture">Fixture history</a></aside><main style="flex:1;height:100vh"><textarea></textarea></main>'
 doc.body.append(layout)
 root.setAttribute('data-dsh-chat-dark-complete','')
 const track=layout.querySelector('aside'),originalStyle=track.getAttribute('style')
 const snapshot=()=>parseWebsiteNavigation(adaptWebsiteNavigation(doc,{origin:'https://chat.deepseek.com',pathname:'/'},{type:'snapshot',showOriginal:false}))
 try {
  snapshot()
  const row=doc.createElement('div')
  row.style.cssText='height:44px;min-height:44px;width:240px;margin-top:auto;display:flex;align-items:center'
  row.innerHTML='<img style="width:32px;height:32px" alt="fictional avatar"><span>Fixture account</span>'
  track.append(row)
  const state=snapshot()
  check('late avatar in a padded hidden sidebar confirms the real footer account',state.authenticated===true && state.accountName==='Fixture account')
  check('late profile measurement restores exact inline geometry and hidden navigation',track.getAttribute('style')===originalStyle && getComputedStyle(track).display==='none')
  check('late account proof releases the public conversation list',state.status==='ready' && state.conversations.length===1 && state.canCreate===true)
 } finally {
  doc.dispatchEvent(new Event('dsh-chat-stop-adapting'))
  adaptWebsiteNavigation(doc,location,{type:'snapshot',showOriginal:true})
  layout.remove()
 }
}
