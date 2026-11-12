// Uso: node drive.mjs <paso>   pasos: click:<texto> | scroll | wait:<s> | sample
import { execSync } from 'node:child_process'
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) } }
await new Promise((r) => (ws.onopen = r))
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
await send('Performance.enable'); await send('Runtime.enable')

async function sample(label) {
  const metrics = Object.fromEntries((await send('Performance.getMetrics')).result.metrics.map((m) => [m.name, m.value]))
  const heap = (await send('Runtime.getHeapUsage')).result
  const procs = execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -match 'com.mysic.desktop' } | ForEach-Object { $p=Get-Process -Id $_.ProcessId -EA 0; if($p){ ([regex]::Match($_.CommandLine,'--type=([\\w-]+)').Groups[1].Value) + ':' + [int]($p.WorkingSet64/1MB) } }"`).toString().trim().split(/\r?\n/)
  const rend = procs.filter((p) => p.startsWith('renderer')).map((p) => +p.split(':')[1]).sort((a, b) => b - a)
  const gpu = procs.filter((p) => p.startsWith('gpu')).map((p) => +p.split(':')[1])
  const total = procs.reduce((s, p) => s + +p.split(':')[1], 0)
  const extra = await ev(`({imgs:document.images.length, dom:document.getElementsByTagName('*').length, mp:+([...document.images].reduce((s,i)=>s+(i.complete?i.naturalWidth*i.naturalHeight:0),0)/1e6).toFixed(1), hash:location.hash})`)
  console.log(label.padEnd(22), JSON.stringify({ heapMB: +(heap.usedSize / 1048576).toFixed(0), ...extra, listeners: metrics.JSEventListeners, rendererMB: rend, gpuMB: gpu, totalMB: total }))
}

for (const step of process.argv.slice(2)) {
  if (step === 'sample') await sample('sample')
  else if (step === 'scroll') {
    for (let i = 0; i < 12; i++) { await ev(`(()=>{for(const el of document.querySelectorAll('*')){if(el.scrollHeight>el.clientHeight+50&&/auto|scroll/.test(getComputedStyle(el).overflowY))el.scrollTop=el.scrollHeight}})()`); await sleep(700) }
    await sample('after scroll')
  } else if (step.startsWith('wait:')) await sleep(+step.slice(5) * 1000)
  else if (step.startsWith('click:')) {
    const t = step.slice(6)
    const ok = await ev(`(()=>{const b=[...document.querySelectorAll('button,a,[role=tab],[role=button]')].find(e=>e.textContent.trim().toLowerCase().startsWith(${JSON.stringify(t.toLowerCase())}));if(b){b.click();return true}return false})()`)
    console.log('click', t, ok); await sleep(6000); await sample('after ' + t)
  }
}
ws.close()
