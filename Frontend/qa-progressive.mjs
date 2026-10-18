import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createServer } from 'vite'
const backendRequire = createRequire(new URL('../Backend/package.json', import.meta.url))
const { JSDOM } = backendRequire('jsdom')
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
for (const key of ['window', 'document', 'localStorage', 'HTMLElement']) globalThis[key] = dom.window[key]
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.addEventListener = dom.window.addEventListener.bind(dom.window)
globalThis.removeEventListener = dom.window.removeEventListener.bind(dom.window)
const requests = []
globalThis.fetch = async (url, { signal } = {}) => {
  requests.push(String(url))
  const parsed = new URL(url, 'http://localhost')
  const type = parsed.searchParams.get('type')
  const query = parsed.searchParams.get('q')
  await new Promise(resolve => setTimeout(resolve, query === 'slow' ? 80 : 5))
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  return { ok: true, json: async () => ({ type, items: [{ id: query, name: query, title: query }] }) }
}
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: 'custom' })
try {
  const React = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { useBrowse } = await server.ssrLoadModule('/src/features/youtube/hooks/useBrowse.js')
  let browse
  function Harness() { browse = useBrowse({ progressive: true }); return null }
  const root = createRoot(document.getElementById('root'))
  await React.act(async () => root.render(React.createElement(Harness)))
  await React.act(async () => Promise.all([browse.runSearch('Ado', 'all'), browse.runSearch('Ado', 'all')]))
  assert.equal(requests.length, 1, 'repeated Enter shares the in-flight search')
  requests.length = 0
  await React.act(async () => browse.runSearch('Ado', 'all'))
  assert.equal(requests.length, 1)
  assert.match(requests[0], /type=song/)
  assert.equal(browse.results.songs[0].id, 'Ado')
  await React.act(async () => Promise.all([browse.loadSection('artist'), browse.loadSection('artist')]))
  assert.equal(requests.length, 2, 'deduplicates visible section requests')
  assert.equal(browse.results.artists[0].id, 'Ado')
  assert.equal(browse.results.albums.length, 0)
  await React.act(async () => {
    const old = browse.runSearch('slow', 'all')
    await browse.runSearch('new', 'all')
    await old
  })
  assert.equal(browse.results.query, 'new', 'old query cannot overwrite current results')
  await React.act(async () => browse.showDownloads())
  await React.act(async () => browse.goBack())
  await React.act(async () => browse.loadSection('album'))
  assert.equal(browse.results.albums[0].id, 'new', 'returning to catalog resumes deferred sections')
  await React.act(async () => browse.runSearch('Ado', 'album'))
  assert.equal(browse.results.type, 'album')
  assert.equal(browse.results.items[0].id, 'Ado')
  await React.act(async () => root.unmount())
  const observers = []
  globalThis.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this) }
    observe() {}
    disconnect() { this.disconnected = true }
  }
  const { default: VisibleContent } = await server.ssrLoadModule('/src/components/VisibleContent.jsx')
  const sectionRoot = createRoot(document.getElementById('root'))
  let loads = 0
  await React.act(async () => sectionRoot.render(React.createElement(VisibleContent,
    { title: 'Álbumes', onVisible: async () => { loads++ } }, React.createElement('img', { src: '/cover.jpg', alt: '' }))))
  assert.equal(loads, 0, 'offscreen section does not request data')
  assert.equal(document.getElementById('root').firstElementChild.style.minWidth, '0', 'deferred wrapper must not expand the parent grid to carousel width')
  assert.equal(document.querySelectorAll('img').length, 0, 'offscreen section does not mount artwork')
  await React.act(async () => observers[0].callback([{ isIntersecting: true }]))
  assert.equal(loads, 1)
  assert.equal(document.querySelectorAll('img').length, 1)
  await React.act(async () => sectionRoot.unmount())
  assert.ok(observers.every(observer => observer.disconnected), 'observers cleaned on unmount')
  console.log('PASS: songs first, sections on demand, deduplication, stale cancellation, direct filters')
  console.log('PASS: offscreen sections defer requests and artwork; visibility loads once; cleanup')
} finally { await server.close(); dom.window.close() }
