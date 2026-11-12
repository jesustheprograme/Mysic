// Mide clic -> contenido visible al abrir album / playlist / artista desde Inicio (gestos reales por CDP).
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pend = new Map()
const net = new Map()
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id) return pend.get(m.id)?.(m)
  const p = m.params
  if (m.method === 'Network.requestWillBeSent' && /\/api\/youtube\/(album|artist|playlist)\//.test(p.request.url)) net.set(p.requestId, { url: p.request.url.replace(/^.*\/api\/youtube/, ''), t0: p.timestamp })
  if (m.method === 'Network.responseReceived' && net.has(p.requestId)) { const r = net.get(p.requestId); r.ttfb = Math.round((p.timestamp - r.t0) * 1000); r.status = p.response.status; r.cache = p.response.fromDiskCache || p.response.fromServiceWorker ? 'cache' : 'red'; r.srv = p.response.headers['server-timing'] || '' }
  if (m.method === 'Network.loadingFinished' && net.has(p.requestId)) { const r = net.get(p.requestId); r.total = Math.round((p.timestamp - r.t0) * 1000); r.kb = Math.round(p.encodedDataLength / 1024) }
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await send('Network.enable')

await ev(`(()=>{if(window.__m)return;window.__m={t0:0,done:null};
  addEventListener('pointerdown',()=>{window.__m.t0=performance.now();window.__m.done=null;window.__m.first=null},true);
  const check=()=>{const m=window.__m;if(!m.t0||m.done)return;
    const rows=document.querySelectorAll('.collection-detail .song-row, .collection-detail [class*=track], .artist-profile .sl-song, .artist-profile [class*=song], .artist-profile [class*=release]').length;
    const hasView=!!document.querySelector('.collection-detail, .artist-profile');
    if(hasView&&!m.first)m.first=Math.round(performance.now()-m.t0);
    if(hasView&&rows>0)m.done=Math.round(performance.now()-m.t0)};
  new MutationObserver(check).observe(document.body,{childList:true,subtree:true,attributes:false});setInterval(check,50)})()`)

await ev(`[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim().startsWith('Inicio'))?.click()`)
await sleep(4500)
for (let i = 0; i < 14; i++) { await ev(`(()=>{const s=[...document.querySelectorAll('*')].find(el=>el.scrollHeight>el.clientHeight+50&&/auto|scroll/.test(getComputedStyle(el).overflowY)&&el.querySelector('.yt-landing'));if(s)s.scrollTop=s.scrollHeight})()`); await sleep(700) }
await ev(`(()=>{const s=[...document.querySelectorAll('*')].find(el=>el.scrollHeight>el.clientHeight+50&&/auto|scroll/.test(getComputedStyle(el).overflowY)&&el.querySelector('.yt-landing'));if(s)s.scrollTop=0})()`)
await sleep(800)

const targets = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('.yt-landing .home-shelf-card__button')].map((b,i)=>({i,t:(b.getAttribute('aria-label')||b.textContent||'').trim().slice(0,28),artist:!!b.closest('.home-shelf--artists')})).slice(0,60))`))
console.log('tarjetas disponibles:', targets.length)

async function open(i, { hover }) {
  await ev(`document.querySelectorAll('.yt-landing .home-shelf-card__button')[${i}].scrollIntoView({block:'center',behavior:'instant'})`)
  await sleep(300)
  const p = JSON.parse(await ev(`(()=>{const b=document.querySelectorAll('.yt-landing .home-shelf-card__button')[${i}].getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2})})()`))
  net.clear()
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 3, y: 3 })
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y })
  if (hover) await sleep(1800)
  await ev(`window.__m.t0=0;window.__m.done=null`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  let m
  for (let k = 0; k < 120; k++) { await sleep(100); m = JSON.parse(await ev(`JSON.stringify(window.__m)`)); if (m.done) break }
  await sleep(300)
  const view = await ev(`document.querySelector('.artist-profile')?'artista':document.querySelector('.collection-detail')?'coleccion':'otra'`)
  const reqs = [...net.values()].map((r) => `${r.url.slice(0, 22)} ${r.status ?? '-'} ttfb ${r.ttfb ?? '-'}ms total ${r.total ?? '-'}ms ${r.kb ?? '?'}KB`)
  // volver
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>/volver|atrÃ¡s|back/i.test(e.getAttribute('aria-label')||e.title||e.textContent));b?.click()})()`)
  await sleep(1500)
  const back = await ev(`!!document.querySelector('.yt-landing')`)
  return { i, hover, view, vistaMs: m.first ?? null, contenidoMs: m.done ?? null, reqs, volvio: back }
}

const picks = [0, 3, 6, 9, 12, 15, 18, 21].filter((n) => n < targets.length)
const cold = []
const warm = []
for (const n of picks) {
  const r = await open(n, { hover: false }); cold.push(r); console.log('FRIO', targets[n].t, '|', JSON.stringify(r))
  const r2 = await open(n + 1 < targets.length ? n + 1 : n, { hover: true }); warm.push(r2); console.log('HOVER', targets[n + 1]?.t, '|', JSON.stringify(r2))
}
const st = (a, k) => { const v = a.map((x) => x[k]).filter((x) => typeof x === 'number').sort((p, q) => p - q); return v.length ? `n=${v.length} min ${v[0]} mediana ${v[Math.floor(v.length / 2)]} max ${v.at(-1)}` : 'sin datos' }
console.log('FRIO  vista visible:', st(cold, 'vistaMs'), '| con contenido:', st(cold, 'contenidoMs'))
console.log('HOVER vista visible:', st(warm, 'vistaMs'), '| con contenido:', st(warm, 'contenidoMs'))
ws.close()

