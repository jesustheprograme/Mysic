import { execSync } from 'node:child_process'
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json()
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pend = new Map()
ws.onmessage = (e) => { const m = JSON.parse(e.data); pend.get(m.id)?.(m) }
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true })).result?.result?.value
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const mem = () => execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'msedgewebview2.exe' -and $_.CommandLine -match 'com.mysic.desktop' -and $_.CommandLine -match 'type=renderer' } | ForEach-Object { [int]((Get-Process -Id $_.ProcessId).WorkingSet64/1MB) }"`).toString().trim().split(/\r?\n/).map(Number).sort((a, b) => b - a)
const step = async (l) => { await send('HeapProfiler.collectGarbage'); await sleep(3000); const heap = (await send('Runtime.getHeapUsage')).result; console.log(l.padEnd(26), 'renderers', mem(), 'heapMB', Math.round(heap.usedSize / 1048576), 'dom', await ev('document.getElementsByTagName("*").length')) }
const go = async (t) => { await ev(`[...document.querySelectorAll('button,a')].find(e=>e.textContent.trim().startsWith(${JSON.stringify(t)}))?.click()`); await sleep(4000) }
const scroll = async () => { for (let i = 0; i < 6; i++) { await ev(`for(const el of document.querySelectorAll('*')){if(el.scrollHeight>el.clientHeight+50&&/auto|scroll/.test(getComputedStyle(el).overflowY))el.scrollTop=el.scrollHeight}`); await sleep(600) } }
await step('inicio (ciclo 0)')
for (let c = 1; c <= 8; c++) { await go('Biblioteca'); await scroll(); await go('Artistas'); await scroll(); await go('Estadísticas'); await go('Inicio'); await scroll(); await step('inicio tras ciclo ' + c) }
ws.close()
