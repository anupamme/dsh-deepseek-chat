import test from 'node:test'
import assert from 'node:assert/strict'
import { createWindowDragTracker, parseWindowDragGeometry, readWebsiteWindowDragGeometry, websiteWindowDragScript, windowDragExclusions, type WindowDragRegion } from '../src/window-drag.js'
import { parseWebsiteNavigation } from '../src/website-navigation.js'

const viewport={width:1000,height:800}
const geometry={...viewport,regions:[{left:400,top:0,width:500,height:40}]}
const flush = async () => { for (let i=0;i<4;i++) await Promise.resolve() }

function fakeTimers() {
  let now=0, serial=0
  const scheduled=new Map<number,{at:number;callback:()=>void}>()
  return {
    setTimeout(callback:()=>void,delayMs:number) { const id=++serial;scheduled.set(id,{at:now+delayMs,callback});return id },
    clearTimeout(handle:unknown) { scheduled.delete(handle as number) },
    get size() { return scheduled.size },
    async advance(ms:number) {
      const end=now+ms
      let callbacks=0
      while (true) {
        const next=[...scheduled].filter(([,item])=>item.at<=end).sort((a,b)=>a[1].at-b[1].at || a[0]-b[0])[0]
        if (!next) break
        assert.ok(callbacks++<1000,'fixture timers must not spin')
        now=next[1].at;scheduled.delete(next[0]);next[1].callback();await flush()
      }
      now=end;await flush()
    },
  }
}
function deferred() {
  let resolvePromise!:(regions:readonly WindowDragRegion[])=>void, rejectPromise!:(error:Error)=>void, settled=false
  const promise=new Promise<readonly WindowDragRegion[]>((resolve,reject)=>{resolvePromise=resolve;rejectPromise=reject})
  return {
    promise,
    get settled() { return settled },
    resolve(regions:readonly WindowDragRegion[]) { settled=true;resolvePromise(regions) },
    reject(error:Error) { settled=true;rejectPromise(error) },
  }
}
function trackerFixture(options:{intervalMs?:number;timeoutMs?:number}={}) {
  const timers=fakeTimers(), reads:ReturnType<typeof deferred>[]=[], changes:(readonly WindowDragRegion[])[]=[]
  let maximumInFlight=0
  const tracker=createWindowDragTracker({
    ...options,timers,
    read() { const request=deferred();reads.push(request);maximumInFlight=Math.max(maximumInFlight,reads.filter(item=>!item.settled).length);return request.promise },
    onChange(regions) { changes.push(regions) },
  })
  return {tracker,timers,reads,changes,get maximumInFlight(){return maximumInFlight}}
}
async function seed(fixture:ReturnType<typeof trackerFixture>) {
  fixture.tracker.start();fixture.reads[0].resolve(geometry.regions);await flush()
}

test('tracker starts once, is explicit before start, and cannot restart after dispose',async()=>{
  const f=trackerFixture()
  f.tracker.refresh();assert.equal(f.reads.length,0)
  f.tracker.start();f.tracker.start();assert.equal(f.reads.length,1)
  f.reads[0].resolve(geometry.regions);await flush()
  f.tracker.start();assert.equal(f.reads.length,1);assert.deepEqual(f.changes,[geometry.regions])
  f.tracker.dispose();f.tracker.dispose();assert.deepEqual(f.changes,[geometry.regions,[]]);assert.equal(f.timers.size,0)
  f.tracker.start();f.tracker.refresh();await f.timers.advance(2000)
  assert.equal(f.reads.length,1);assert.equal(f.maximumInFlight,1)
})
test('unchanged geometry keeps sampling without emitting or expiring a successful sample',async()=>{
  const timers=fakeTimers(), changes:(readonly WindowDragRegion[])[]=[]
  let reads=0, left=400
  const tracker=createWindowDragTracker({timers,read(){reads++;return [{left,top:0,width:500,height:40}]},onChange(regions){changes.push(regions)}})
  tracker.start();await flush();await timers.advance(2000)
  assert.equal(reads,11);assert.deepEqual(changes,[geometry.regions]);assert.equal(timers.size,1)
  left=410;await timers.advance(200)
  assert.deepEqual(changes,[geometry.regions,[{left:410,top:0,width:500,height:40}]])
  tracker.dispose();assert.equal(timers.size,0)
})
test('only the current request deadline revokes geometry and late success cannot revive it',async()=>{
  const f=trackerFixture();await seed(f)
  await f.timers.advance(200);assert.equal(f.reads.length,2)
  await f.timers.advance(499)
  assert.deepEqual(f.changes,[geometry.regions],'the previous successful sample has no 500ms lease')
  await f.timers.advance(1);assert.deepEqual(f.changes,[geometry.regions,[]])
  await f.timers.advance(2000)
  assert.equal(f.reads.length,2,'a timeout cannot cancel the underlying read or start another one')
  f.reads[1].resolve(geometry.regions);await flush();assert.deepEqual(f.changes,[geometry.regions,[]])
  await f.timers.advance(200);assert.equal(f.reads.length,3)
  f.reads[2].resolve(geometry.regions);await flush();assert.deepEqual(f.changes,[geometry.regions,[],geometry.regions])
  assert.equal(f.maximumInFlight,1);f.tracker.dispose()
})
test('a delayed but timely identical result stays visible beyond the former lease',async()=>{
  const f=trackerFixture();await seed(f)
  await f.timers.advance(200);await f.timers.advance(450)
  assert.deepEqual(f.changes,[geometry.regions])
  f.reads[1].resolve(geometry.regions);await flush()
  assert.deepEqual(f.changes,[geometry.regions]);assert.equal(f.timers.size,1)
  f.tracker.dispose()
})
test('refresh fences stale results and coalesces storms into one immediate read after settle',async()=>{
  const f=trackerFixture();f.tracker.start()
  for(let i=0;i<500;i++)f.tracker.refresh()
  assert.equal(f.reads.length,1)
  f.reads[0].resolve(geometry.regions);await flush()
  assert.deepEqual(f.changes,[]);assert.equal(f.reads.length,2)
  f.reads[1].resolve(geometry.regions);await flush();assert.deepEqual(f.changes,[geometry.regions])
  f.tracker.refresh();assert.equal(f.reads.length,3);assert.deepEqual(f.changes,[geometry.regions])
  for(let i=0;i<500;i++)f.tracker.refresh()
  f.reads[2].resolve([{left:100,top:0,width:100,height:40}]);await flush()
  assert.equal(f.reads.length,4);assert.deepEqual(f.changes,[geometry.regions])
  f.reads[3].resolve(geometry.regions);await flush()
  assert.deepEqual(f.changes,[geometry.regions]);assert.equal(f.maximumInFlight,1);assert.equal(f.timers.size,1)
  f.tracker.dispose()
})
test('refresh during a timed-out read waits for physical settlement before the fresh epoch',async()=>{
  const f=trackerFixture();await seed(f);await f.timers.advance(200)
  for(let i=0;i<500;i++)f.tracker.refresh()
  await f.timers.advance(1500)
  assert.deepEqual(f.changes,[geometry.regions,[]]);assert.equal(f.reads.length,2)
  f.reads[1].resolve(geometry.regions);await flush()
  assert.equal(f.reads.length,3);assert.deepEqual(f.changes,[geometry.regions,[]])
  f.reads[2].resolve(geometry.regions);await flush()
  assert.deepEqual(f.changes,[geometry.regions,[],geometry.regions]);assert.equal(f.maximumInFlight,1)
  f.tracker.dispose()
})
test('a failed read revokes geometry once and later successful sampling recovers',async()=>{
  const f=trackerFixture();await seed(f);await f.timers.advance(200)
  f.reads[1].reject(new Error('fictional geometry failure'));await flush()
  assert.deepEqual(f.changes,[geometry.regions,[]])
  await f.timers.advance(200);f.reads[2].resolve([]);await flush()
  assert.deepEqual(f.changes,[geometry.regions,[]])
  await f.timers.advance(200);f.reads[3].resolve(geometry.regions);await flush()
  assert.deepEqual(f.changes,[geometry.regions,[],geometry.regions]);assert.equal(f.maximumInFlight,1)
  f.tracker.dispose()
})
test('synchronous read errors revoke geometry without stranding the poller',async()=>{
  const timers=fakeTimers(), changes:(readonly WindowDragRegion[])[]=[]
  let reads=0
  const tracker=createWindowDragTracker({timers,intervalMs:80,timeoutMs:300,read(){if(++reads===2)throw new Error('fictional sync failure');return geometry.regions},onChange(regions){changes.push(regions)}})
  tracker.start();await flush();await timers.advance(80)
  assert.deepEqual(changes,[geometry.regions,[]]);assert.equal(timers.size,1)
  await timers.advance(80);assert.deepEqual(changes,[geometry.regions,[],geometry.regions])
  tracker.dispose();assert.equal(timers.size,0)
})
test('dispose clears timers and rejects both late geometry and refresh requests',async()=>{
  const f=trackerFixture();await seed(f);await f.timers.advance(200)
  f.tracker.dispose();assert.deepEqual(f.changes,[geometry.regions,[]]);assert.equal(f.timers.size,0)
  f.tracker.refresh();f.tracker.start();f.reads[1].resolve(geometry.regions);await flush();await f.timers.advance(5000)
  assert.equal(f.reads.length,2);assert.deepEqual(f.changes,[geometry.regions,[]]);assert.equal(f.timers.size,0)
})
test('a rejected request from an obsolete refresh epoch does not publish stale failure',async()=>{
  const f=trackerFixture();await seed(f);await f.timers.advance(200);f.tracker.refresh()
  f.reads[1].reject(new Error('fictional obsolete failure'));await flush()
  assert.equal(f.reads.length,3);assert.deepEqual(f.changes,[geometry.regions])
  f.reads[2].resolve(geometry.regions);await flush();assert.deepEqual(f.changes,[geometry.regions])
  f.tracker.dispose()
})
test('native hit targets accept only finite in-viewport non-overlapping top-row gaps',()=>{
  assert.equal(parseWindowDragGeometry(geometry,viewport).length,1)
  for(const region of [{left:-1,top:0,width:100,height:40},{left:0,top:0,width:1001,height:40},{left:10,top:1,width:100,height:40},{left:10,top:0,width:100,height:41},{left:NaN,top:0,width:100,height:40}])assert.deepEqual(parseWindowDragGeometry({...geometry,regions:[region]},viewport),[])
  assert.deepEqual(parseWindowDragGeometry({...geometry,regions:[geometry.regions[0],geometry.regions[0]]},viewport),[])
})
test('resize discards old dimensions instead of scaling stale hit regions',()=>{
  assert.deepEqual(parseWindowDragGeometry(geometry,{width:999,height:790}),[])
})
test('geometry projection serializes no message/input text, credential or network APIs',()=>{
  assert.doesNotMatch(websiteWindowDragScript(),/textContent|innerText|\.value\b|localStorage|sessionStorage|document\.cookie|fetch\(|XMLHttpRequest/)
})
test('exclusions are the exact full-row complement, including narrow control holes',()=>{
  const regions=[{left:16,top:0,width:24,height:40},{left:44,top:0,width:40,height:40}]
  assert.deepEqual(windowDragExclusions(regions,100),[
    {left:0,top:0,width:16,height:40},{left:40,top:0,width:4,height:40},{left:84,top:0,width:16,height:40},
  ])
  const excluded=windowDragExclusions(geometry.regions,viewport.width)
  assert.deepEqual(excluded,[{left:0,top:0,width:400,height:40},{left:900,top:0,width:100,height:40}])
  for(let x=0.5;x<viewport.width;x++) {
    const contains=(region:WindowDragRegion)=>x>=region.left && x<region.left+region.width
    assert.equal(Number(geometry.regions.some(contains))+Number(excluded.some(contains)),1)
  }
})
test('exclusions normalize safe overlapping gaps without mutating the input',()=>{
  const regions=[{left:400,top:0,width:100,height:40},{left:100,top:0,width:100,height:40},{left:180,top:0,width:220,height:40}]
  const before=JSON.stringify(regions)
  assert.deepEqual(windowDragExclusions(regions,1000),[{left:0,top:0,width:100,height:40},{left:500,top:0,width:500,height:40}])
  assert.equal(JSON.stringify(regions),before)
  assert.deepEqual(windowDragExclusions([{left:0,top:0,width:1000,height:40}],1000),[])
  assert.deepEqual(windowDragExclusions([],1000),[{left:0,top:0,width:1000,height:40}])
})
test('malformed or partial-height gaps fail closed instead of creating unsafe row coverage',()=>{
  const full=[{left:0,top:0,width:1000,height:40}]
  for(const region of [
    {left:400,top:0,width:500,height:20},{left:400,top:1,width:500,height:40},
    {left:-1,top:0,width:500,height:40},{left:800,top:0,width:500,height:40},
    {left:400,top:0,width:NaN,height:40},{left:400,top:0,width:0,height:40},
  ])assert.deepEqual(windowDragExclusions([region],1000),full)
  for(const width of [0,-1,NaN,Infinity])assert.deepEqual(windowDragExclusions(geometry.regions,width),[])
})

function geometryNode(left:number,width:number,options:{tag?:string;top?:number;title?:boolean;text?:boolean;editable?:boolean}={}) {
  const top=options.top ?? 8, tag=options.tag ?? 'span'
  const selectors=new Set([tag])
  if(options.editable) { selectors.add('[contenteditable]');selectors.add('[contenteditable="plaintext-only"]') }
  return {
    visibility:'visible',childElementCount:0,childNodes:options.text ? [{nodeType:3}] : [],
    getBoundingClientRect:()=>({left,right:left+width,top,bottom:top+24,width,height:24}),
    matches:(selector:string)=>selector.split(',').some(item=>selectors.has(item)),
    hasAttribute:(attribute:string)=>attribute==='data-dsh-chat-header-title-host' && options.title===true,
    get textContent():never { throw new Error('fixture forbids reading text') },
    get value():never { throw new Error('fixture forbids reading inputs') },
  }
}
function geometryDocument(options:{titleWidth?:number;cssInset?:number;extra?:ReturnType<typeof geometryNode>[];overlays?:ReturnType<typeof geometryNode>[];active?:ReturnType<typeof geometryNode>}={}) {
  const title=geometryNode(24,options.titleWidth ?? 56,{title:true}), button=geometryNode(920,24,{tag:'button'})
  const nodes=[title,button,...(options.extra ?? [])]
  const header={querySelectorAll:()=>nodes}
  const content={
    getBoundingClientRect:()=>({left:0,right:1000,top:0,bottom:800,width:1000,height:800}),
    querySelector:()=>header,
    querySelectorAll:(selector:string)=>nodes.filter(node=>node.matches(selector)),
  }
  const doc={
    defaultView:{innerWidth:1000,innerHeight:800,getComputedStyle:(node:ReturnType<typeof geometryNode>)=>({display:'block',visibility:node.visibility})},
    documentElement:{hasAttribute:()=>false,style:{getPropertyValue:()=> `${options.cssInset ?? 24}px`}},
    activeElement:options.active ?? null,
    querySelector:(selector:string)=>selector==='[data-dsh-chat-content]' ? content : selector==='[data-dsh-chat-navigation]' ? {} : null,
    querySelectorAll:()=>options.overlays ?? [],
  }
  return doc as unknown as Document
}
test('idle title protection uses the actual title box plus 8px, not a reserved future editor lane',()=>{
  const short=readWebsiteWindowDragGeometry(geometryDocument(),'https://chat.deepseek.com')
  assert.deepEqual(short,{...viewport,regions:[{left:88,top:0,width:824,height:40},{left:952,top:0,width:40,height:40}]})
  const long=readWebsiteWindowDragGeometry(geometryDocument({titleWidth:600}),'https://chat.deepseek.com')
  assert.deepEqual(long,{...viewport,regions:[{left:632,top:0,width:280,height:40},{left:952,top:0,width:40,height:40}]})
})
test('host leading controls stay excluded while guest CSS still has the old inset',()=>{
  const doc=geometryDocument({cssInset:24}), expected={...viewport,regions:[
    {left:160,top:0,width:752,height:40},{left:952,top:0,width:40,height:40},
  ]}
  const sample=readWebsiteWindowDragGeometry(doc,'https://chat.deepseek.com',160)
  assert.deepEqual(sample,expected)
  assert.ok(sample?.regions.every(region=>region.left>=160))
  assert.deepEqual(parseWindowDragGeometry(sample,viewport),expected.regions)
  const script=websiteWindowDragScript(160)
  assert.ok(script.endsWith(')(document,location.origin,160)'))
  assert.deepEqual(new Function('document','location',`return ${script}`)(doc,{origin:'https://chat.deepseek.com'}),expected)
})
test('host inset cannot shrink the guest CSS or actual title clearance',()=>{
  assert.equal(readWebsiteWindowDragGeometry(geometryDocument({cssInset:240}),'https://chat.deepseek.com',160)?.regions[0].left,240)
  assert.equal(readWebsiteWindowDragGeometry(geometryDocument({titleWidth:600}),'https://chat.deepseek.com',160)?.regions[0].left,632)
  assert.equal(readWebsiteWindowDragGeometry(geometryDocument(),'https://chat.deepseek.com',160.5)?.regions[0].left,160.5)
  assert.ok(websiteWindowDragScript(160.5).endsWith(')(document,location.origin,160.5)'))
  assert.deepEqual(readWebsiteWindowDragGeometry(geometryDocument(),'https://chat.deepseek.com',1000),{...viewport,regions:[]})
})
test('invalid host inset fails closed in direct and numeric-only serialized samples',()=>{
  const doc=geometryDocument()
  for(const inset of [-1,1000.1,NaN,Infinity,-Infinity,'160' as unknown as number,null as unknown as number]) {
    assert.equal(readWebsiteWindowDragGeometry(doc,'https://chat.deepseek.com',inset),null)
    const script=websiteWindowDragScript(inset)
    assert.match(script,/\)\(document,location\.origin,-?[\d.]+\)$/)
    assert.equal(new Function('document','location',`return ${script}`)(doc,{origin:'https://chat.deepseek.com'}),null)
  }
})
test('interactive fields and occupied text keep their real box clearance without a global pause',()=>{
  const field=geometryNode(24,300,{tag:'input'})
  const fieldGeometry=readWebsiteWindowDragGeometry(geometryDocument({extra:[field]}),'https://chat.deepseek.com')
  assert.equal(fieldGeometry?.regions[0].left,332)
  const text=geometryNode(400,40,{text:true})
  assert.deepEqual(readWebsiteWindowDragGeometry(geometryDocument({extra:[text]}),'https://chat.deepseek.com')?.regions,[
    {left:88,top:0,width:304,height:40},{left:448,top:0,width:464,height:40},{left:952,top:0,width:40,height:40},
  ])
})
test('focused top editors and visible popup layers suspend geometry, then safely resume',()=>{
  for(const editor of [geometryNode(24,300,{tag:'input'}),geometryNode(24,300,{tag:'textarea'}),geometryNode(24,300,{editable:true})]) {
    assert.equal(readWebsiteWindowDragGeometry(geometryDocument({extra:[editor],active:editor}),'https://chat.deepseek.com'),null)
  }
  const below=geometryNode(24,300,{tag:'textarea',top:60})
  assert.ok(readWebsiteWindowDragGeometry(geometryDocument({extra:[below],active:below}),'https://chat.deepseek.com'))
  const dialog=geometryNode(200,300,{top:100}), doc=geometryDocument({overlays:[dialog]})
  assert.equal(readWebsiteWindowDragGeometry(doc,'https://chat.deepseek.com'),null)
  dialog.visibility='hidden'
  assert.ok(readWebsiteWindowDragGeometry(doc,'https://chat.deepseek.com'))
})
test('serialized geometry works on fictional boxes and refuses any other origin',()=>{
  const doc=geometryDocument()
  const sample=new Function('document','location',`return ${websiteWindowDragScript()}`)(doc,{origin:'https://chat.deepseek.com'})
  assert.deepEqual(sample,readWebsiteWindowDragGeometry(doc,'https://chat.deepseek.com'))
  assert.equal(readWebsiteWindowDragGeometry(doc,'https://fictional.invalid'),null)
})

test('unknown account never becomes signed-out or publishes a list',()=>{
  const result=parseWebsiteNavigation({status:'unsupported',identityUnconfirmed:true,conversations:[],canCreate:true,error:'fictional failure'})
  assert.equal(result.authenticated,undefined);assert.equal(result.identityUnconfirmed,true);assert.equal(result.canCreate,false)
})
test('independently proven identity survives mirror failure but commands/history do not',()=>{
  const result=parseWebsiteNavigation({status:'unsupported',authenticated:true,accountName:'Fixture',conversations:[{href:'https://chat.deepseek.com/a/chat/s/fixture',title:'Fake',group:'Fake'}],canCreate:true})
  assert.equal(result.authenticated,true);assert.equal(result.accountName,'Fixture');assert.equal(result.conversations.length,0);assert.equal(result.canCreate,false)
})
test('a recognition failure remains visible when the controller retains earlier proof',()=>{
  const result=parseWebsiteNavigation({status:'unsupported',authenticated:true,identityUnconfirmed:true,accountName:'Fixture',conversations:[],error:'fictional failure'})
  assert.equal(result.identityUnconfirmed,true);assert.equal(result.error,'fictional failure')
})
test('safe-layout metadata cannot bypass the explicit unconfirmed-identity projection',()=>{
  const base={status:'unsupported',conversations:[],canCreate:false,layoutReady:true}
  assert.equal(parseWebsiteNavigation(base).layoutReady,undefined)
  const proven=parseWebsiteNavigation({...base,identityUnconfirmed:true})
  assert.equal(proven.layoutReady,true);assert.equal(proven.authenticated,undefined);assert.equal(proven.canCreate,false)
  assert.equal(parseWebsiteNavigation({...base,identityUnconfirmed:true,layoutReady:'yes'}).layoutReady,false)
})
