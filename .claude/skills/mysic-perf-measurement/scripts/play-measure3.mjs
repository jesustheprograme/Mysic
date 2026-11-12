// Descompone la latencia del stream (servidor) y verifica el cambio rapido con registro por evento.
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pend = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id) pend.get(m.id)?.(m) }
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await ev(`document.querySelector('audio')?.pause()`)
await ev(`[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim().startsWith('Inicio'))?.click()`)
await sleep(4000)
const rows = await ev(`document.querySelectorAll('.yt-landing .sl-song').length`)
const point = async (index) => {
  await ev(`document.querySelectorAll('.yt-landing .sl-song')[${index}].scrollIntoView({block:'center',behavior:'instant'})`)
  await sleep(350)
  return JSON.parse(await ev(`(()=>{const el=document.querySelectorAll('.yt-landing .sl-song')[${index}];const b=el.querySelector('.sl-song__cover').getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2,title:el.querySelector('strong')?.textContent?.slice(0,22)})})()`))
}
const move = (p) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y })
const click = async (p) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 })
}

// A) Latencia del servidor para una cancion ya resuelta (la que acaba de sonar).
const base = await ev(`(()=>{const a=document.querySelector('audio');return /\/stream\//.test(a?.src||'')?a.src:''})()`)
if (base) {
  const out = await ev(`(async()=>{
    const src=${JSON.stringify(base)};const r={};
    const t=async(f)=>{const s=performance.now();const x=await f();return [Math.round(performance.now()-s),x]};
    r.info=[];for(let i=0;i<3;i++){const [ms,res]=await t(()=>fetch(src+'/info',{credentials:'include'}));r.info.push(ms+'ms/'+res.status);await res.text()}
    r.ttfb=[];for(let i=0;i<4;i++){const c=new AbortController();const [ms,res]=await t(()=>fetch(src,{credentials:'include',headers:{Range:'bytes=0-65535'},signal:c.signal}));r.ttfb.push(ms+'ms/'+res.status);const s=performance.now();const b=await res.arrayBuffer();r.ttfb[i]+=' +'+Math.round(performance.now()-s)+'ms/'+Math.round(b.byteLength/1024)+'KB'}
    const [ms,res]=await t(()=>fetch(src,{credentials:'include',headers:{Range:'bytes=0-1048575'}}));const s=performance.now();const b=await res.arrayBuffer();const dl=performance.now()-s;
    r.megabyte='cabeceras '+ms+'ms, cuerpo '+Math.round(dl)+'ms, '+Math.round(b.byteLength/1024)+'KB => '+Math.round(b.byteLength/1024/((ms+dl)/1000))+' KB/s';
    r.headers=[...res.headers.entries()].filter(([k])=>/content-(type|length|range)|cache|accept/.test(k)).map(([k,v])=>k+': '+v).join(' | ');
    return JSON.stringify(r)})()`)
  console.log('SERVIDOR', out)
} else console.log('SERVIDOR: no hay cancion cargada todavia')

// B) Pruebas en frio con registro por evento (src real en cada evento).
await ev(`(()=>{const a=document.querySelector('audio');if(window.__log)return;window.__log=[];for(const n of ['loadstart','waiting','canplay','playing','stalled','error','pause'])a.addEventListener(n,()=>window.__log.push({n,t:Math.round(performance.now()),src:(a.src.split('/').pop()||'').split('?')[0],buf:a.buffered.length?+a.buffered.end(a.buffered.length-1).toFixed(1):0}))})()`)
const results = []
// Alterna: indices pares en FRIO (el puntero llega y pulsa) e impares PREPARADOS (el puntero se detiene 3,5 s antes,
// como al pasar el cursor por una fila): asi se mide la precarga por intencion.
for (const idx of [2, 3, 6, 7, 10, 11, 14, 15, 18, 19].filter((i) => i < rows)) {
  const warm = idx % 2 === 1
  await ev(`performance.clearMarks();window.__log.length=0`)
  const p = await point(idx)
  await move({ x: 5, y: 5 }); await move(p)
  if (warm) { await sleep(3500); await move({ x: p.x + 1, y: p.y }) }
  await click(p)
  let done = null
  for (let i = 0; i < 100; i++) {
    await sleep(100)
    done = JSON.parse(await ev(`(()=>{const m=performance.getEntriesByType('mark');const it=m.find(x=>x.name==='mysic:playback-intent');const pl=window.__log.find(x=>x.n==='playing'&&it&&x.src===it.detail?.id);return JSON.stringify({intent:it?Math.round(it.startTime):null,id:it?.detail?.id,playing:pl?.t??null,canplay:window.__log.find(x=>x.n==='canplay'&&it&&x.src===it.detail?.id)?.t??null,stalls:window.__log.filter(x=>x.n==='stalled'||x.n==='waiting').length,err:window.__log.some(x=>x.n==='error')})})()`))
    if (done.playing) break
  }
  const r = { title: p.title, preparada: warm, clicAudio: done.playing && done.intent ? done.playing - done.intent : null, clicCanplay: done.canplay && done.intent ? done.canplay - done.intent : null, esperas: done.stalls, error: done.err, registrado: done.intent != null }
  results.push(r); console.log(JSON.stringify(r))
  await sleep(1500)
}
const report = (label, group) => {
  const v = group.map((x) => x.clicAudio).filter((x) => typeof x === 'number').sort((a, b) => a - b)
  console.log(label + ' clic->audio n=' + v.length + '/' + group.length, 'min', v[0], 'mediana', v[Math.floor(v.length / 2)], 'max', v.at(-1), '| sin audio en 10 s:', group.filter((x) => x.registrado && x.clicAudio == null).length, '| clic no registrado:', group.filter((x) => !x.registrado).length)
}
report('FRIO     ', results.filter((x) => !x.preparada))
report('PREPARADA', results.filter((x) => x.preparada))

// C) Cambio rapido: 5 canciones con 150 ms entre clics, partiendo de pausa.
await ev(`document.querySelector('audio')?.pause()`); await sleep(800)
const picks = [1, 5, 9, 13, 3].filter((i) => i < rows)
const pts = []
for (const i of picks) pts.push(await point(i)) // posiciones no fiables tras cada scroll: se recalculan abajo
await ev(`performance.clearMarks();window.__log.length=0`)
let lastTitle = ''
for (const i of picks) {
  await ev(`document.querySelectorAll('.yt-landing .sl-song')[${i}].scrollIntoView({block:'center',behavior:'instant'})`)
  await sleep(120)
  const p = JSON.parse(await ev(`(()=>{const el=document.querySelectorAll('.yt-landing .sl-song')[${i}];const b=el.querySelector('.sl-song__cover').getBoundingClientRect();return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2,title:el.querySelector('strong')?.textContent?.slice(0,22)})})()`))
  await move(p); await click(p); lastTitle = p.title
  await sleep(30)
}
await sleep(8000)
const rapid = JSON.parse(await ev(`(()=>{const a=document.querySelector('audio');const m=performance.getEntriesByType('mark').filter(x=>x.name==='mysic:playback-intent');const last=m.at(-1)?.detail?.id;const played=window.__log.filter(x=>x.n==='playing');return JSON.stringify({clicsRegistrados:m.length,ultimaId:last,suenaAhora:(a.src.split('/').pop()||'').split('?')[0],pausado:a.paused,t:+a.currentTime.toFixed(1),playingDeOtras:played.filter(x=>x.src!==last).length,playingTotal:played.length,ultimaClicAudio:played.at(-1)&&m.at(-1)?played.at(-1).t-Math.round(m.at(-1).startTime):null,errores:window.__log.filter(x=>x.n==='error').length,alerta:[...document.querySelectorAll('.player-dock [role=alert]')].map(e=>e.textContent.trim()).join('|'),iframes:document.querySelectorAll('iframe').length,titulo:document.querySelector('.player-dock__details strong')?.textContent?.slice(0,22)})})()`))
console.log('RAPIDO ultima pulsada:', lastTitle, JSON.stringify(rapid))
await ev(`document.querySelector('audio')?.pause()`)
ws.close()
